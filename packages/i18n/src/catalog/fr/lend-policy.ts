import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Connectez-vous pour emprunter et gagner sur Aave.",
  ON_OTHER_NETWORK: "Aave V4 fonctionne sur {{network}}.",
  NOT_AVAILABLE_YET: "L'emprunt n'est pas disponible pour le moment.",
  PAUSED_ALL: "Vous avez mis en pause tous les mouvements d'argent. Reprenez-les dans Réglages pour continuer.",
  WALLET_NOT_READY: "Configurez d'abord votre portefeuille.",
  WALLET_NOT_SET_UP: "Configurez d'abord votre portefeuille sur ce réseau.",
  ASSET_UNCLEAR: "Quel actif ?",
  LEND_ASSET_UNAVAILABLE: "Aave V4 ne propose pas {{asset}} pour cela ici.",
  LEND_NOT_COLLATERAL: "{{asset}} n'est pas accepté en garantie ici. cirBTC, WETH et USDC le sont.",
  LEND_NOTHING_OWED: "Vous ne devez aucun {{asset}}.",
  AMOUNT_MISSING: "Combien ?",
  AMOUNT_INVALID: "Ce montant n'est pas valide.",
  INSUFFICIENT_BALANCE: "Pas assez de {{asset}}. Vous avez {{balance}}.",
  OVER_POSITION: "Vous avez {{position}} sur Aave.",
  INSUFFICIENT_GAS: "Gardez un peu d'USDC pour les frais de réseau.",
  HEALTH_TOO_LOW:
    "La santé tomberait à {{health}}. Kawase la garde au-dessus de {{min}} : empruntez moins ou apportez plus.",
  HEALTH_NEAR_LIMIT:
    "La santé serait de {{health}}, proche de la limite. Une petite baisse de prix pourrait la mettre en danger.",
  fixSwitch: "Passer à Arc",
};
