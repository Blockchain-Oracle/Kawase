// Add money → From a wallet (A6, web): the wallets installed in this browser announce themselves (EIP-6963: MetaMask,
// Rabby, Coinbase Wallet, Phantom…, each with its own name and icon), the person connects one, and it sends USDC on Arc
// to their own Kawase address — the wallet asks its own question; Kawase only reads the chain to say when it arrived.
// Nothing here can move Kawase's money: it only ever asks the outside wallet to pay in.
import * as React from "react";
import { createPublicClient, encodeFunctionData, erc20Abi, http, numberToHex, type Address, type Chain, type Hex } from "viem";
import { ARC_CHAINS } from "@kawase/networks";

import type { NetworkId } from "@kawase/api-client";
import { arcStablecoin } from "@kawase/wallet";

// Arc's chains with its current endpoints (testnet moved to arc.io; viem's built-ins still carry the old hosts).
const { mainnet: arc, testnet: arcTestnet } = ARC_CHAINS;

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
export type AnnouncedWallet = { uuid: string; name: string; icon: string; rdns: string; provider: Eip1193 };
type AnnounceEvent = CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>;

const CHAINS: Record<NetworkId, Chain> = { mainnet: arc, testnet: arcTestnet };
const RECEIPT_TIMEOUT_MS = 120_000;
/** The wallet doesn't know the chain yet (EIP-1193's "unrecognized chain"). */
const UNKNOWN_CHAIN = 4902;
/** The person closed or refused the wallet's own question. */
const USER_REJECTED = 4001;

/** The wallets this browser has, as they announce themselves (none on a phone app or a browser without any). */
export function useAnnouncedWallets(): AnnouncedWallet[] {
  const [wallets, setWallets] = React.useState<AnnouncedWallet[]>([]);
  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onAnnounce = (event: Event) => {
      const { info, provider } = (event as AnnounceEvent).detail;
      setWallets((current) => (current.some((wallet) => wallet.uuid === info.uuid) ? current : [...current, { ...info, provider }]));
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);
  return wallets;
}

export async function connectWallet(wallet: AnnouncedWallet): Promise<Address> {
  const accounts = (await wallet.provider.request({ method: "eth_requestAccounts" })) as string[];
  const first = accounts[0];
  if (!first) throw new Error("no account");
  return first as Address;
}

/** USDC on Arc held by the outside wallet (base units), read from the chain. */
export async function walletUsdc(network: NetworkId, address: Address): Promise<bigint> {
  const chain = CHAINS[network];
  const client = createPublicClient({ chain, transport: http() });
  const usdc = arcStablecoin(network, "USDC")!;
  return client.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

/** Puts the outside wallet on Arc, adding the chain to it first when it has never seen Arc. */
async function onArc(wallet: AnnouncedWallet, chain: Chain) {
  const chainId = numberToHex(chain.id);
  try {
    await wallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== UNKNOWN_CHAIN) throw error;
    await wallet.provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          ...(chain.blockExplorers ? { blockExplorerUrls: [chain.blockExplorers.default.url] } : {}),
        },
      ],
    });
  }
}

export type PayInStage = "switching" | "confirm" | "arriving";
export type PayInResult = { status: "arrived"; hash: Hex } | { status: "refused" } | { status: "failed"; hash?: Hex };

/** The outside wallet sends `amount` USDC to the person's Kawase address on Arc; resolves when the chain says so. */
export async function payIn(input: {
  wallet: AnnouncedWallet;
  from: Address;
  to: Address;
  amount: bigint;
  network: NetworkId;
  onStage: (stage: PayInStage) => void;
}): Promise<PayInResult> {
  const chain = CHAINS[input.network];
  try {
    input.onStage("switching");
    await onArc(input.wallet, chain);
    input.onStage("confirm");
    const hash = (await input.wallet.provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: input.from,
          to: arcStablecoin(input.network, "USDC"),
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [input.to, input.amount] }),
        },
      ],
    })) as Hex;
    input.onStage("arriving");
    const client = createPublicClient({ chain, transport: http() });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    return receipt.status === "success" ? { status: "arrived", hash } : { status: "failed", hash };
  } catch (error) {
    if ((error as { code?: number }).code === USER_REJECTED) return { status: "refused" };
    return { status: "failed" };
  }
}
