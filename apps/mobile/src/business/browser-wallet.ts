// The web: paying an invoice from whatever wallet the browser has (an EIP-1193 provider such as MetaMask or Rabby),
// with the exact transaction the invoice link hands over — Arc's Memo contract carrying the invoice's on-chain
// reference around the token transfer — so the payment is matched to the invoice by that reference.
import { arc, arcTestnet, type Chain } from "viem/chains";

type Eip1193 = { request: (input: { method: string; params?: unknown[] }) => Promise<unknown> };

/** What `wallet_addEthereumChain` needs, from viem's own Arc definitions. */
const toAddChain = (chain: Chain) => ({
  chainName: chain.name,
  rpcUrls: [...chain.rpcUrls.default.http],
  blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : [],
  nativeCurrency: chain.nativeCurrency,
});
const ARC_CHAINS = new Map<number, ReturnType<typeof toAddChain>>([
  [arc.id, toAddChain(arc)],
  [arcTestnet.id, toAddChain(arcTestnet)],
]);
const UNKNOWN_CHAIN = 4902;
const HEX = 16;

const provider = (): Eip1193 | undefined => (globalThis as { ethereum?: Eip1193 }).ethereum;

export const hasBrowserWallet = () => Boolean(provider());

/** Connects, switches to the invoice's chain (adding Arc when the wallet does not know it), and sends the call. */
export async function payWithBrowserWallet(pay: { chainId: number; to: string; data: string }): Promise<string> {
  const wallet = provider();
  if (!wallet) throw new Error("no browser wallet");
  const [from] = (await wallet.request({ method: "eth_requestAccounts" })) as string[];
  if (!from) throw new Error("no account");
  const chainId = `0x${pay.chainId.toString(HEX)}`;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    if ((error as { code?: number }).code !== UNKNOWN_CHAIN) throw error;
    const chain = ARC_CHAINS.get(pay.chainId);
    if (!chain) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId, ...chain }] });
  }
  return (await wallet.request({ method: "eth_sendTransaction", params: [{ from, to: pay.to, data: pay.data }] })) as string;
}
