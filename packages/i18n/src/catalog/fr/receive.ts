import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Recevoir",
  warning: "USDC et EURC sur Arc uniquement. Kawase ne voit pas l’argent envoyé sur d’autres réseaux.",
  copy: "Copier l’adresse",
  share: "Partager",
  network: "Réseau",
  shareMessage: "Mon adresse Kawase sur {{network}} : {{address}}",
  askAmount: "Demander un montant",
  askAsset: "Actif",
  askShow: "Afficher le code",
  askHint: "Tout portefeuille qui le scanne remplit {{amount}} sur {{network}}.",
  askClear: "Retirer le montant",
  shareAsk: "Envoie-moi {{amount}} sur {{network}} : {{address}}\n{{uri}}",
  noWallet: "Connectez-vous pour obtenir une adresse",
  noWalletBody: "Votre adresse est créée avec votre compte.",
  setUpFirst: "Configurez d’abord votre portefeuille",
  setUpFirstBody: "Une étape, et votre adresse est prête à recevoir.",
  anyToken:
    "Tout jeton sur Arc arrive ici. Envoyé sur une autre chaîne ? Il arrive à cette même adresse là-bas : ramenez-le sur Arc depuis Ajouter de l'argent.",
};
