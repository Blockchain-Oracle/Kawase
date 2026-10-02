import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "Payer {{amount}}",
  signInToPay: "Connectez-vous pour payer",
  otherWallet: "Payer depuis un autre portefeuille",
  otherWalletBody:
    "Envoyez exactement {{amount}} sur {{network}} à cette adresse. La demande passe à « payée » dès réception.",
  ownRequest: "C’est votre propre demande. Partagez le lien avec la personne qui doit payer.",
  paidTitle: "Déjà payée",
  paidBody: "Cette demande a été payée. Plus rien à faire.",
  canceledTitle: "Demande annulée",
  canceledBody: "{{name}} a annulé cette demande. Rien à payer.",
  expiredTitle: "Demande expirée",
  expiredBody: "Ce lien n’est plus ouvert. Demandez-en un nouveau à {{name}}.",
  notFoundTitle: "Demande introuvable",
  notFoundBody: "Vérifiez le lien ou demandez-en un nouveau.",
  loadFailed: "Impossible de charger cette demande.",
};
