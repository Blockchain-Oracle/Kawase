import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "Connectez-vous pour trader.",
  ON_OTHER_NETWORK: "Long et short fonctionnent sur {{network}}.",
  NOT_AVAILABLE_YET: "Long et short ne sont pas disponibles pour l'instant.",
  PAUSED_ALL: "Vous avez mis en pause tous les mouvements d'argent. Reprenez-les dans les Réglages pour continuer.",
  WALLET_NOT_READY: "Configurez d'abord votre portefeuille.",
  WALLET_NOT_SET_UP: "Configurez d'abord votre portefeuille sur ce réseau.",
  MARKET_MISSING: "Quel marché ?",
  SIDE_MISSING: "Long ou short ?",
  MARGIN_MARKET_UNAVAILABLE:
    "Aucun marché de prêt ne liste {{market}} : impossible d'aller long ou short ici. Achetez-le, ou créez une alerte de prix.",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} ne peut pas aller en {{side}} ici. Un long dessus est un simple achat.",
  POSITION_MISSING: "Aucune position ouverte de ce type.",
  AMOUNT_MISSING: "Quelle marge ?",
  AMOUNT_INVALID: "Ce montant n'est pas valide.",
  INSUFFICIENT_BALANCE: "Pas assez d'USDC. Vous avez {{balance}}.",
  INSUFFICIENT_GAS: "Gardez environ {{needed}} pour les frais de réseau.",
  LEVERAGE_TOO_HIGH: "Ce marché autorise jusqu'à {{max}}×.",
  QUOTE_UNAVAILABLE: "Pas de prix pour l'instant.",
  MARGIN_RISK: "Le levier peut vous faire perdre toute votre marge.",
  fixTryAgain: "Réessayer",
  fixSwitch: "Passer sur Arc",
};
