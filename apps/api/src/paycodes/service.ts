// Scan to pay (plan §A.4.4): a code read by the scanner (or pasted, or seen in chat) becomes the flow it asks for,
// on the active network: an address (with the amount and currency an EIP-681 link carried) opens Send filled in —
// where the recipient check runs as always —, a Kawase request or invoice link opens its pay page. What cannot be
// paid here says why (R2): the other Arc network (switch first), another chain, a token Kawase does not send here,
// a request that is paid, expired or cancelled.
import { erc20Abi, formatUnits, getAddress } from "viem";

import type { PayCodeView } from "@kawase/api-client";
import { NETWORKS, NETWORK_ADDRESSES, SHARED_ADDRESSES, type NetworkId } from "@kawase/networks";
import { PUBLIC_LINKS } from "@kawase/config";

import type { InvoiceService } from "../business/invoices";
import type { RequestService } from "../requests/service";
import type { SessionUser } from "../types";
import type { Chains } from "../wallet/chain";
import { parsePayCode, scaledAmount } from "./parse";

const STABLE_DECIMALS = 6;
/** Chains people most often print codes for, by id, for the "this is for Base" line. */
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
  11155111: "Ethereum Sepolia",
  84532: "Base Sepolia",
  421614: "Arbitrum Sepolia",
  11155420: "Optimism Sepolia",
};

const hostOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).host.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

const other = (network: NetworkId): NetworkId => (network === "testnet" ? "mainnet" : "testnet");

export class PayCodeService {
  private readonly hosts: string[];

  constructor(
    private readonly requests: RequestService,
    private readonly invoices: InvoiceService | undefined,
    webUrl: string | undefined,
    /** For an unknown token's decimals (any ERC-20 on Arc). */
    private readonly chains?: Chains | undefined,
  ) {
    this.hosts = [PUBLIC_LINKS.webApp, PUBLIC_LINKS.api, PUBLIC_LINKS.landing, webUrl, "https://kawase.84.46.247.92.sslip.io", "https://kawase-api.84.46.247.92.sslip.io"]
      .map(hostOf)
      .filter((host): host is string => Boolean(host));
  }

  /** USDC or EURC on a network, by token address. */
  private assetOf(network: NetworkId, token: string): "USDC" | "EURC" | null {
    const lower = token.toLowerCase();
    if (lower === SHARED_ADDRESSES.usdc.toLowerCase()) return "USDC";
    if (lower === NETWORK_ADDRESSES[network].eurc.toLowerCase()) return "EURC";
    return null;
  }

  async resolve(user: SessionUser, code: string): Promise<PayCodeView> {
    const network = user.activeNetwork;
    const known = new Set([SHARED_ADDRESSES.usdc, NETWORK_ADDRESSES.mainnet.eurc, NETWORK_ADDRESSES.testnet.eurc].map((address) => address.toLowerCase()));
    const parsed = parsePayCode(code, this.hosts, (token) => (known.has(token.toLowerCase()) ? STABLE_DECIMALS : null));

    if (parsed.kind === "request") {
      let request;
      try {
        request = await this.requests.openPublic(parsed.token);
      } catch {
        // An invoice in any token has its own link and no payment request: pay what is left of it with Send, carrying
        // the invoice's on-chain reference (Arc Memo), so the business's books match it by memoId.
        const invoice = this.invoices ? await this.invoices.publicView(parsed.token).catch(() => undefined) : undefined;
        if (!invoice) return { status: "unsupported", reason: "not_found" };
        if (invoice.status === "paid" || invoice.status === "canceled") return { status: "unsupported", reason: "request_closed", network: invoice.network };
        if (invoice.network !== network) return { status: "unsupported", reason: "other_network", network: invoice.network };
        const remaining = BigInt(invoice.remaining);
        return {
          status: "send",
          network,
          to: invoice.payTo,
          amount: remaining > BigInt(0) ? formatUnits(remaining, invoice.decimals) : null,
          asset: invoice.tokenAddress ?? invoice.asset,
          memo: invoice.number,
          memoId: invoice.memoId,
        };
      }
      if (request.status !== "open") return { status: "unsupported", reason: "request_closed", network: request.network };
      const invoice = this.invoices ? await this.invoices.publicView(parsed.token).catch(() => undefined) : undefined;
      return {
        status: "request",
        token: parsed.token,
        request,
        invoice: invoice ? { number: invoice.number, business: invoice.business.name ?? null } : null,
      };
    }

    if (parsed.kind !== "address") return { status: "unsupported", reason: "not_a_payment" };

    // Which network the code is for: none named means Arc, this network.
    const target = parsed.chainId === null ? network : parsed.chainId === NETWORKS[network].chainId ? network : parsed.chainId === NETWORKS[other(network)].chainId ? other(network) : undefined;
    if (!target)
      return { status: "unsupported", reason: "other_chain", chainId: parsed.chainId ?? undefined, chainName: parsed.chainId ? CHAIN_NAMES[parsed.chainId] : undefined };
    if (target !== network) return { status: "unsupported", reason: "other_network", network: target };
    // Native value on Arc is USDC (Arc's gas token). A token is USDC, EURC, or any ERC-20 on this network (R1: every
    // asset is first-class; Send runs the token rules and the recipient check on it).
    // A reference the code carries (Arc Memo) rides along: the send writes it on chain with the payment.
    const memo = { memo: parsed.memo ?? null, memoId: parsed.memoId ?? null };
    if (parsed.native || !parsed.token) return { status: "send", network, to: parsed.address, amount: parsed.amount, asset: parsed.native && parsed.amount ? "USDC" : null, ...memo };
    const stable = this.assetOf(network, parsed.token);
    if (stable) return { status: "send", network, to: parsed.address, amount: parsed.amount, asset: stable, ...memo };
    const decimals = await this.decimals(network, parsed.token);
    if (decimals === undefined) return { status: "unsupported", reason: "unsupported_asset", token: getAddress(parsed.token) };
    const amount = parsed.rawAmount ? scaledAmount(parsed.rawAmount, decimals) : parsed.amount;
    return { status: "send", network, to: parsed.address, amount, asset: getAddress(parsed.token), ...memo };
  }

  /** An ERC-20's decimals on this network; undefined when the address is no token here. */
  private async decimals(network: NetworkId, token: string): Promise<number | undefined> {
    const client = this.chains?.get(network)?.client;
    if (!client) return undefined;
    try {
      return Number(await client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "decimals" }));
    } catch {
      return undefined;
    }
  }
}
