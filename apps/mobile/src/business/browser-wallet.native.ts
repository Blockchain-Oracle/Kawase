// iOS and Android have no browser wallet: Kawase's own Pay flow (or any wallet, by address) is offered instead.
export const hasBrowserWallet = () => false;

export async function payWithBrowserWallet(): Promise<string> {
  throw new Error("no browser wallet on this platform");
}
