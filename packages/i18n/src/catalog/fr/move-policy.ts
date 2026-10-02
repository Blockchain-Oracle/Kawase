import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "Connectez-vous pour déplacer de l'argent entre chaînes.",
  ON_OTHER_NETWORK: "Cela fonctionne sur l'autre réseau.",
  NOT_AVAILABLE_YET: "Le transfert entre chaînes n'est pas disponible pour l'instant.",
  PAUSED_ALL: "Vous avez mis en pause tous les mouvements d'argent. Reprenez-les dans les Réglages pour continuer.",
  WALLET_NOT_READY: "Configurez d'abord votre portefeuille.",
  WALLET_NOT_SET_UP: "Configurez d'abord votre portefeuille sur ce réseau.",
  DESTINATION_MISSING: "Quelle chaîne ?",
  RECIPIENT_INVALID: "{{query}} n'est pas une adresse valide.",
  RECIPIENT_UNKNOWN: "Qui est {{query}} ? Utilisez un contact, un @identifiant ou une adresse.",
  RECIPIENT_NO_WALLET: "@{{handle}} n'a pas encore de portefeuille Kawase.",
  RECIPIENT_AMBIGUOUS: "Plusieurs contacts correspondent. Lequel ?",
  LOOKALIKE_ADDRESS: "Cela ressemble à l'adresse de {{name}}, mais ce n'est pas elle. Vérifiez.",
  FIRST_TIME_RECIPIENT: "Premier paiement à cette adresse. Vérifiez-la avant d'envoyer.",
  AMOUNT_MISSING: "Combien ?",
  AMOUNT_INVALID: "Ce montant n'est pas valide.",
  INSUFFICIENT_BALANCE: "Pas assez d'USDC là-bas. Vous avez {{balance}}.",
  INSUFFICIENT_GAS: "Gardez environ {{needed}} sur Arc pour les frais de réseau.",
  QUOTE_UNAVAILABLE: "Aucun itinéraire ne peut le porter pour l'instant.",
};
