import type { Catalog } from "../en/index";

export const scan: Catalog["scan"] = {
  title: "Scanner pour payer",
  fanLabel: "Scanner",
  body: "Visez un QR de paiement : une adresse, un lien de paiement ou une demande Kawase.",
  reading: "Lecture du code…",
  failed: "Impossible de lire ce code. Réessayez, ou collez-le.",
  paste: "Coller à la place",
  torch: "Lampe",
  allow: "Autoriser l’appareil photo",
  allowBody: "Kawase utilise l’appareil photo pour scanner les codes de paiement. Vous pouvez aussi en coller un.",
  deniedBody: "L’appareil photo est désactivé pour Kawase. Activez-le dans les Réglages, ou collez le code.",
  openSettings: "Ouvrir les Réglages",
  again: "Scanner à nouveau",
  otherNetwork: "Ce code est pour {{network}}. Changez de réseau pour le payer là-bas.",
  otherChain: "Ce code demande un paiement sur {{chain}}. Kawase paie sur Arc ; demandez-leur une adresse Arc.",
  otherChainUnknown:
    "Ce code demande un paiement sur une autre chaîne. Kawase paie sur Arc ; demandez-leur une adresse Arc.",
  unsupportedAsset: "Ce code demande un jeton qui n’existe pas sur ce réseau.",
  requestClosed: "Cette demande est déjà payée, expirée ou annulée.",
  notFound: "Aucune demande Kawase ne correspond à ce lien.",
  notPayment: "Ce n’est pas un code de paiement.",
  chatPrompt: "Paie ceci : {{code}}",
};
