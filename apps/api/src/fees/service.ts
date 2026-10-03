// Fees in the person's terms (plan §A.4 12 "No dead end"): Arc gas is paid in USDC, so the wallet's USDC is also its
// fee reserve. One action's cost is read from Arc's current gas price × a typical action's gas (with the same headroom
// a send draft uses); "~N actions left" is the USDC held ÷ that. When it is short, a USDC or EURC send goes through
// the EIP-3009 relayer instead (Kawase pays the fee), so running out of gas is never a dead end. Also the display
// currency's rate (open.er-api.com through the market cache; values stay in US dollars until shown).
import { erc20Abi, type Address } from "viem";

import type { FeeReserveView, FxView } from "@kawase/api-client";
import { ACTION_GAS, DISPLAY_CURRENCIES, FEE_RESERVE_ACTIONS, FEE_RESERVE_LOW_ACTIONS, GAS_ESTIMATE_HEADROOM_PERCENT, MIN_MAX_FEE_PER_GAS_GWEI, isDisplayCurrency } from "@kawase/config";
import { USDC_NATIVE_DECIMALS, decimalsOf, rescale } from "@kawase/money";
import type { NetworkId } from "@kawase/networks";

import { HTTP, problem } from "../http/problem";
import type { MarketData } from "../market/sources";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";

const GWEI = 1_000_000_000n;
const PERCENT = 100n;
const ONE = 1n;
const ZERO = 0n;

/** Native wei (18 decimals) → USDC base units (6), rounded up so a cost is never shown smaller than it is. */
export const feeInUsdc = (nativeWei: bigint) => {
  const scaled = rescale(nativeWei, USDC_NATIVE_DECIMALS, decimalsOf("USDC"));
  return rescale(scaled, decimalsOf("USDC"), USDC_NATIVE_DECIMALS) < nativeWei ? scaled + ONE : scaled;
};

export class FeeService {
  constructor(
    private readonly chains: Chains,
    private readonly wallets: WalletService,
    private readonly market: MarketData,
  ) {}

  /** What one typical transfer and one 7702 batch cost now on this network, in USDC base units. */
  async actionCost(network: NetworkId): Promise<{ transfer: bigint; batch: bigint }> {
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
    const fees = await clients.client.estimateFeesPerGas();
    const floor = MIN_MAX_FEE_PER_GAS_GWEI * GWEI;
    const perGas = fees.maxFeePerGas > floor ? fees.maxFeePerGas : floor;
    const cost = (gas: bigint) => feeInUsdc((gas * GAS_ESTIMATE_HEADROOM_PERCENT * perGas) / PERCENT);
    return { transfer: cost(ACTION_GAS.transfer), batch: cost(ACTION_GAS.batch) };
  }

  async reserve(user: SessionUser): Promise<FeeReserveView> {
    const network = user.activeNetwork;
    const clients = this.chains.get(network);
    if (!clients) throw problem(HTTP.unprocessable, "network_unavailable");
    const wallet = (await this.wallets.userWallet(user.id))?.address as Address | undefined;
    const [cost, usdc] = await Promise.all([
      this.actionCost(network),
      wallet ? clients.client.readContract({ address: clients.network.addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }) : Promise.resolve(ZERO),
    ]);
    const actionsLeft = cost.transfer > ZERO ? Number(usdc / cost.transfer) : 0;
    return {
      network,
      hasWallet: Boolean(wallet),
      usdc: usdc.toString(),
      perTransfer: cost.transfer.toString(),
      perBatch: cost.batch.toString(),
      actionsLeft,
      reserve: (cost.transfer * BigInt(FEE_RESERVE_ACTIONS)).toString(),
      low: actionsLeft <= FEE_RESERVE_LOW_ACTIONS,
      // A USDC or EURC send is never stuck on gas: the EIP-3009 relayer carries it (send/relayed.ts).
      relayer: true,
    };
  }

  async fx(currency: string): Promise<FxView> {
    const code = currency.toUpperCase();
    if (!isDisplayCurrency(code)) throw problem(HTTP.unprocessable, "validation", "not a display currency Kawase offers");
    const perUsd = await this.market.fx(code);
    // No rate today: dollars, said plainly (the app shows USD and the reason).
    return perUsd ? { currency: code, perUsd, at: new Date().toISOString(), supported: [...DISPLAY_CURRENCIES] } : { currency: "USD", perUsd: 1, at: new Date().toISOString(), supported: [...DISPLAY_CURRENCIES], unavailable: code };
  }
}
