import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "Gagner n'est pas encore disponible sur ce réseau.",
  ON_OTHER_NETWORK: "Gagner fonctionne sur {{network}}.",
  PAUSED_ALL: "Vous avez mis en pause tous les mouvements d'argent. Reprenez-les dans Réglages pour continuer.",
  SIGN_IN_REQUIRED: "Connectez-vous pour gagner.",
  WALLET_NOT_READY: "Configurez d'abord votre portefeuille.",
  WALLET_NOT_SET_UP: "Configurez d'abord votre portefeuille sur ce réseau.",
  VAULT_UNAVAILABLE: "Ce coffre n'est pas disponible ici.",
  AMOUNT_MISSING: "Combien ?",
  AMOUNT_INVALID: "Ce montant n'est pas valide.",
  INSUFFICIENT_BALANCE: "Pas assez d'USDC. Vous avez {{balance}}.",
  INSUFFICIENT_GAS: "Gardez environ {{needed}} pour les frais de réseau.",
  OVER_POSITION: "C'est plus que ce que vous avez dans ce coffre ({{position}}).",
  VAULT_LIQUIDITY_SHORT:
    "Le coffre ne peut verser que {{available}} pour l'instant ; le reste est prêté. Essayez moins ou plus tard.",
  VAULT_LOW_LIQUIDITY: "Liquidité faible : les retraits peuvent devoir attendre",
  VAULT_RISK_WARNING: "App Kit signale ce coffre : {{warnings}}",
  VAULT_LIQUIDITY_STUCK:
    "Ce coffre ne peut verser que {{available}} pour l'instant, donc Kawase n'y dépose rien. Choisissez-en un liquide.",
};
