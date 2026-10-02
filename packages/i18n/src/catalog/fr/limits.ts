import type { Catalog } from "../en/index";

export const limits: Catalog["limits"] = {
  title: "Portefeuille et limites",
  setUp: "Configuré · la même adresse sur les deux réseaux",
  notSetUp: "Pas encore configuré sur ce réseau",
  notSetUpBody: "Configurez d'abord votre portefeuille sur ce réseau. Cela prend quelques secondes.",
  offBody: "Le plafond quotidien est désactivé : chaque envoi demande votre Face ID.",
  offBodyWeb: "Le plafond quotidien est désactivé : chaque envoi demande un code reçu par email.",
  offBodyAndroid:
    "Le plafond quotidien est désactivé : chaque envoi demande votre empreinte ou le verrouillage de l'écran.",
  turnOn: "Activer le plafond quotidien",
  holdToRevoke: "Maintenez pour désactiver le plafond",
  revoking: "Désactivation…",
  revokeNote: "Le désactiver est une transaction sur Arc que vous signez. Kawase perd l'autorisation immédiatement.",
  revoked: "Plafond quotidien désactivé",
  holdHint: "Maintenez {{seconds}} secondes pour confirmer. Relâcher plus tôt annule.",
  revokeSigning: "En attente de votre signature…",
  revokeChecking: "Vérification auprès du réseau…",
  revokeNotSigned: "La signature n'a pas abouti. Votre plafond est toujours actif.",
  revokeFailed: "Cela n'a pas abouti. Votre plafond est toujours actif.",
  revokeReverted: "Le réseau l'a refusé. Votre plafond est toujours actif.",
  revokeUnconfirmed:
    "Pas encore confirmé. Cela peut encore aboutir sur le réseau — vérifiez de nouveau avant de réessayer.",
  checkAgain: "Vérifier à nouveau",
};
