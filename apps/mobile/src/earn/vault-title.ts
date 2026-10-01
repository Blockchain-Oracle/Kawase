// A vault's name as people read it (review K06). App Kit's names read like configuration — "EarnKit USDC Vault (Arc
// Testnet)", "MockMorphoVault (Arc Testnet)" — while the network is already on the screen and every row is a vault.
// The title drops the network suffix and the word "Vault", and splits a single run-together name into words
// ("Mock Morpho"); a name already written in words keeps its own spelling ("EarnKit USDC"). The full name stays in
// the vault's detail (the review sheet).
export function vaultTitle(name: string): string {
  const bare = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const words = /\s/.test(bare) ? bare : bare.replace(/([a-z])([A-Z])/g, "$1 $2");
  const title = words.replace(/\bvault\b/gi, " ").replace(/\s+/g, " ").trim();
  return title || name;
}

/** Test vaults hold test money: anything on testnet, or a vault that says it is a mock. */
export const isTestVault = (name: string, network: "testnet" | "mainnet") => network === "testnet" || /mock/i.test(name);
