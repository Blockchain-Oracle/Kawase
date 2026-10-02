import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "Le pont n'est pas encore disponible sur ce réseau.",
  ON_OTHER_NETWORK: "Le pont fonctionne sur {{network}}.",
  PAUSED_ALL: "Vous avez mis en pause tous les mouvements d'argent. Reprenez-les dans Réglages pour continuer.",
  SIGN_IN_REQUIRED: "Connectez-vous pour utiliser le pont.",
  WALLET_NOT_READY: "Configurez d'abord votre portefeuille.",
  WALLET_NOT_SET_UP: "Configurez d'abord votre portefeuille sur ce réseau.",
  DESTINATION_MISSING: "Vers quelle chaîne ?",
  AMOUNT_MISSING: "Combien ?",
  AMOUNT_INVALID: "Ce montant n'est pas valide.",
  INSUFFICIENT_BALANCE: "Pas assez d'USDC. Vous avez {{balance}}.",
  INSUFFICIENT_GAS: "Gardez environ {{needed}} sur Arc pour les frais de réseau.",
  AMOUNT_BELOW_FEE: "C'est moins que les frais de la route, jusqu'à {{fee}}. Envoyez plus.",
  QUOTE_UNAVAILABLE: "Pas de route pour l'instant.",
};
