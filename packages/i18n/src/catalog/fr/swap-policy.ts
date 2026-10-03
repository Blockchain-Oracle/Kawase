import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "L'échange n'est pas encore disponible sur ce réseau.",
  ON_OTHER_NETWORK: "L'échange fonctionne sur {{network}}.",
  PAUSED_ALL: "Vous avez mis en pause tous les mouvements d'argent. Reprenez-les dans Réglages pour continuer.",
  SIGN_IN_REQUIRED: "Connectez-vous pour échanger.",
  WALLET_NOT_READY: "Configurez d'abord votre portefeuille.",
  WALLET_NOT_SET_UP: "Configurez d'abord votre portefeuille sur ce réseau.",
  INSUFFICIENT_BALANCE: "Pas assez d'argent. Vous avez {{balance}}.",
  INSUFFICIENT_GAS: "Gardez environ {{needed}} pour les frais de réseau.",
  AMOUNT_MISSING: "Combien ?",
  AMOUNT_INVALID: "Ce montant n'est pas valide.",
  ASSET_UNCLEAR: "Depuis USDC ou EURC ?",
  SWAP_SAME_TOKEN: "Choisissez deux devises différentes.",
  SWAP_PAIR_UNSUPPORTED: "Kawase ne peut pas échanger celles-ci ici.",
  QUOTE_UNAVAILABLE: "Pas de prix pour l'instant.",
  PRICE_IMPACT_HIGH:
    "Ce prix est {{gap}} % sous le marché, plus que les {{max}} % autorisés par Kawase. Essayez un montant plus petit ou attendez.",
  RATE_BELOW_REFERENCE: "Ce prix est {{gap}} % sous le taux du marché.",
  fixTryAgain: "Réessayer",
  BRAKE_PRICE_IMPACT: "Ce prix est {{gap}} % sous le marché, au-delà de votre règle de {{max}} %.",
};
