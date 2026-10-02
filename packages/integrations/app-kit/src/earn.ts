// Earning on idle USDC through Circle App Kit Earn (Morpho vaults on Arc; mock Morpho vaults on Arc Testnet), signed
// by the user's own wallet — the swap shape again. App Kit routes a deposit through its adapter contract (approve +
// `execute`, the vault's shares coming back to the wallet) and a withdrawal the other way, so the same capture and
// the same adapter checks apply (`checkSwapCalls` with the share token on one side). Positions are read from the
// vault itself (ERC-4626: shares and what they are worth now).
import { AppKit } from "@circle-fin/app-kit";
import { erc4626Abi, type Address, type PublicClient } from "viem";

import type { NetworkContext } from "@kawase/networks";

import { capturedCalls, checkSwapCalls, withRouteRetry, type SwapCall, type SwapCallCheck } from "./swap";

export type EarnVault = {
  address: Address;
  name: string;
  protocol: string;
  /** Yearly yield as a fraction (0.035 = 3.5%). */
  apy: number;
  /** 30-day average when the vault has one. */
  apy30d: number | null;
  /** Decimal USDC deposited, and what can be withdrawn right now. */
  totalDeposits: string;
  available: string;
  status: string;
  curator: string | null;
  /** Circle's own monitoring of the vault, and any warnings App Kit raises about it. */
  circleGuarded: boolean;
  warnings: string[];
  /** What a deposit could get back out now: "stuck" vaults are never chosen for a deposit (gaps.md G1). */
  liquidity: VaultLiquidity;
};

export type VaultLiquidity = "liquid" | "low" | "stuck";

/** Thresholds from @kawase/config `EARN_LIQUIDITY` (USDC is priced at $1 here: these are USDC vaults). */
export type LiquidityThresholds = { stuckBelowUsd: number; lowShare: number };

/** Liquid, low or stuck, from what the vault can pay out now against what it holds (and App Kit's own flag). */
export function vaultLiquidity(vault: { available: string; totalDeposits: string; status: string }, thresholds: LiquidityThresholds): VaultLiquidity {
  const available = Number(vault.available);
  const total = Number(vault.totalDeposits);
  if (!Number.isFinite(available) || available < thresholds.stuckBelowUsd) return "stuck";
  if (vault.status === "low_liquidity" || (total > 0 && available / total < thresholds.lowShare)) return "low";
  return "liquid";
}

const LIQUIDITY_ORDER: Record<VaultLiquidity, number> = { liquid: 0, low: 1, stuck: 2 };

/** Liquid sources first, then low, then stuck; by yield within each (never by yield alone). */
export const rankVaults = <T extends { liquidity: VaultLiquidity; apy: number }>(vaults: readonly T[]): T[] =>
  [...vaults].sort((a, b) => LIQUIDITY_ORDER[a.liquidity] - LIQUIDITY_ORDER[b.liquidity] || b.apy - a.apy);

type KitVault = {
  vaultAddress: string;
  name: string;
  protocol: string;
  asset: string;
  currentApy: number;
  status: string;
  circleGuarded?: boolean;
  manager?: { name?: string | null } | null;
  apyProfile?: { d30?: number | null } | null;
  riskSignals?: { warnings?: string[]; earnKitWarnings?: string[] } | null;
  totalDeposits?: string;
  liquidity?: string;
  liquidityProfile?: { available?: string } | null;
};

const earnParams = (input: { apiKey: string }) => (input.apiKey ? { config: { apiKey: input.apiKey } } : {});

/**
 * The USDC vaults App Kit lists on this Arc network, ranked by what they can pay out now, then by yield. Testnet's
 * mock vaults report no liquidity at all, so there every vault counts as liquid (it is test money).
 */
export async function exploreVaults(network: NetworkContext, apiKey: string, thresholds: LiquidityThresholds): Promise<EarnVault[]> {
  const kit = new AppKit() as unknown as { earn: { exploreVaults: (params: unknown) => Promise<{ vaults: KitVault[] }> } };
  const { vaults } = await withRouteRetry(() => kit.earn.exploreVaults({ chain: network.appKitChain, ...(apiKey ? { apiKey } : {}) }));
  const listed = vaults
    .filter((vault) => vault.asset === "USDC")
    .map((vault) => {
      const view = {
        address: vault.vaultAddress as Address,
        name: vault.name,
        protocol: vault.protocol,
        apy: vault.currentApy,
        apy30d: vault.apyProfile?.d30 ?? null,
        totalDeposits: vault.totalDeposits ?? "0",
        available: vault.liquidityProfile?.available ?? vault.liquidity ?? "0",
        status: vault.status,
        curator: vault.manager?.name ?? null,
        circleGuarded: Boolean(vault.circleGuarded),
        warnings: [...(vault.riskSignals?.warnings ?? []), ...(vault.riskSignals?.earnKitWarnings ?? [])],
      };
      return { ...view, liquidity: network.isRealMoney ? vaultLiquidity(view, thresholds) : ("liquid" as const) };
    });
  return rankVaults(listed);
}

export type EarnInput = {
  network: NetworkContext;
  client: PublicClient;
  apiKey: string;
  from: Address;
  vault: Address;
  /** Decimal USDC. */
  amount: string;
};

/** The exact calls for a deposit (approve + App Kit adapter), captured before anything is signed. */
export const prepareEarnDeposit = (input: EarnInput): Promise<SwapCall[]> =>
  withRouteRetry(() =>
    capturedCalls(input, (adapter) =>
      (new AppKit() as unknown as { earn: { deposit: (params: unknown) => Promise<unknown> } }).earn.deposit({
        from: { adapter, chain: input.network.appKitChain },
        vaultAddress: input.vault,
        amount: input.amount,
        ...earnParams(input),
      }),
    ),
  );

/** The exact calls for a withdrawal of `amount` USDC from the vault, captured before anything is signed. */
export const prepareEarnWithdraw = (input: EarnInput): Promise<SwapCall[]> =>
  withRouteRetry(() =>
    capturedCalls(input, (adapter) =>
      (new AppKit() as unknown as { earn: { withdraw: (params: unknown) => Promise<unknown> } }).earn.withdraw({
        from: { adapter, chain: input.network.appKitChain },
        vaultAddress: input.vault,
        amount: input.amount,
        ...earnParams(input),
      }),
    ),
  );

/** App Kit approves one base unit over what it takes, both ways (its rounding buffer); the amount taken is exact. */
export const EARN_APPROVAL_SLACK = 1n;

export type VaultPosition = { shares: bigint; assets: bigint };

const NONE = 0n;

/** What the wallet holds in a vault: its shares and what they are worth in USDC now. */
export async function vaultPosition(client: PublicClient, vault: Address, owner: Address): Promise<VaultPosition> {
  const shares = await client.readContract({ address: vault, abi: erc4626Abi, functionName: "balanceOf", args: [owner] });
  const assets = shares > NONE ? await client.readContract({ address: vault, abi: erc4626Abi, functionName: "convertToAssets", args: [shares] }) : NONE;
  return { shares, assets };
}

/** Shares a deposit of `assets` would mint, and shares a withdrawal of `assets` would burn, at the vault's rate now. */
export async function vaultPreview(client: PublicClient, vault: Address, assets: bigint) {
  const [deposit, withdraw] = await Promise.all([
    client.readContract({ address: vault, abi: erc4626Abi, functionName: "previewDeposit", args: [assets] }),
    client.readContract({ address: vault, abi: erc4626Abi, functionName: "previewWithdraw", args: [assets] }),
  ]);
  return { sharesIn: deposit, sharesOut: withdraw };
}

/**
 * The calls may only move USDC into this vault with the shares coming back to the wallet (a deposit), or the
 * wallet's shares out with USDC coming back to it (a withdrawal), through App Kit's adapter, with the vault's own
 * preview as the floor. The same adapter checks as a swap (`checkSwapCalls`).
 */
export function checkEarnCalls(
  network: NetworkContext,
  action: "deposit" | "withdraw",
  calls: readonly SwapCall[],
  /** From the draft: `maxIn` of what goes in (USDC exactly for a deposit, at most these shares for a withdrawal), at least `minOut` back. */
  expected: { from: Address; usdc: Address; vault: Address; maxIn: bigint; minOut: bigint },
): SwapCallCheck {
  const deposit = action === "deposit";
  return checkSwapCalls(network, calls, {
    from: expected.from,
    tokenIn: deposit ? expected.usdc : expected.vault,
    tokenOut: deposit ? expected.vault : expected.usdc,
    amountIn: deposit ? expected.maxIn : { max: expected.maxIn },
    minOut: expected.minOut,
    approvalSlack: EARN_APPROVAL_SLACK,
  });
}
