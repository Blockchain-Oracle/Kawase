// Token logos the app has already been told about, by chain and address. Markets, the portfolio and trending lists
// carry each token's logo; a send review, a feed row or a request draws the same token from a draft that doesn't.
// Every TokenMark that is handed a logo remembers it here, so the token looks the same everywhere it appears.
const logos = new Map<string, string>();

const keyOf = (chainId: number, address: string) => `${chainId}:${address.toLowerCase()}`;

export function rememberTokenLogo(chainId: number, address: string, url: string | null | undefined): void {
  if (url) logos.set(keyOf(chainId, address), url);
}

export function rememberedTokenLogo(chainId: number, address: string): string | undefined {
  return logos.get(keyOf(chainId, address));
}
