import type { Catalog } from "../en/index";

export const deleteAccount: Catalog["deleteAccount"] = {
  title: "Supprimer le compte",
  body: "Votre portefeuille reste à vous. Kawase supprime ce qu'il conserve sur vous : contacts, conversations, boîte de réception et réglages.",
  holdings: "Ce que contient votre compte",
  agentWallet: "Portefeuille de l'agent : {{amount}} (d'abord renvoyé vers votre portefeuille)",
  revoke: "Désactivez ce que Kawase peut faire",
  revokeOn: "Révoquer sur {{network}} ({{count}})",
  revokePrompt: "Révoquer les autorisations de Kawase",
  revoked: "Révoqué sur la chaîne",
  revokeFailed: "La révocation n'a pas abouti. Réessayez.",
  noGrants: "Rien à révoquer.",
  revokeNote:
    "La révocation demande un peu d'USDC pour les frais : faites-la avant de déplacer votre argent. Ce qui n'est pas révoqué ne pourra plus servir une fois le compte supprimé.",
  takeOut: "Retirez votre argent",
  takeOutBody:
    "Envoyez-le ailleurs, ou exportez le portefeuille pour l'utiliser dans une autre app. Vous pouvez aussi le laisser : le portefeuille reste à vous.",
  send: "Envoyer",
  confirm: "Saisissez {{handle}} pour confirmer",
  delete: "Supprimer mon compte",
  done: "Votre compte est supprimé",
  failed: "La suppression n'a pas fonctionné. Rien n'a été supprimé.",
  after:
    "Votre @identifiant est réservé 30 jours pour que personne d'autre ne le prenne. Si vous vous reconnectez plus tard, un nouveau compte démarre avec le même portefeuille.",
  holdToDelete: "Maintenez pour supprimer mon compte",
  typeFirst: "Saisissez d'abord {{handle}}",
  keepHolding: "Continuez d'appuyer",
  stillWorks: "Rien n'a été supprimé. Votre compte fonctionne comme avant.",
  loading: "Vérification de ce que contient votre compte",
  agentWalletRow: "Portefeuille de l'agent",
  agentWalletBack: "Rendu d'abord à votre portefeuille",
  needsWallet: "Configurez votre portefeuille",
};
