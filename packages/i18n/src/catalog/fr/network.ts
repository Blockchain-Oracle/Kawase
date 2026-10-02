import type { Catalog } from "../en/index";

export const network: Catalog["network"] = {
  mainnet: "Réseau principal",
  testnet: "Réseau de test",
  arc: "Arc",
  arcTestnet: "Arc de test",
  testnetStrip: "Réseau de test · pas d'argent réel",
  realMoney: "Argent réel",
  switchTo: "Passer sur {{network}}",
  unavailable: "{{network}} n’est pas encore disponible.",
  signInForMainnet: "Connectez-vous pour utiliser de l’argent réel.",
  consentCheck: "Je comprends qu’il s’agit d’argent réel.",
  chooseNetwork: "Choisir un réseau",
};
