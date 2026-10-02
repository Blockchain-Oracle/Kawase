import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Recevoir",
  warning: "USDC et EURC sur Arc uniquement. Kawase ne voit pas l’argent envoyé sur d’autres réseaux.",
  copy: "Copier l’adresse",
  share: "Partager",
  network: "Réseau",
  shareMessage: "Mon adresse Kawase sur {{network}} : {{address}}",
  noWallet: "Connectez-vous pour obtenir une adresse",
  noWalletBody: "Votre adresse est créée avec votre compte.",
  setUpFirst: "Configurez d’abord votre portefeuille",
  setUpFirstBody: "Une étape, et votre adresse est prête à recevoir.",
};
