import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "Pagar {{amount}}",
  signInToPay: "Inicia sesión para pagar",
  otherWallet: "Pagar desde otra cartera",
  otherWalletBody:
    "Envía exactamente {{amount}} en {{network}} a esta dirección. La petición se marca como pagada al llegar.",
  ownRequest: "Esta es tu propia petición. Comparte el enlace con quien deba pagar.",
  paidTitle: "Ya está pagada",
  paidBody: "Esta petición ya se pagó. No hay nada más que hacer.",
  canceledTitle: "Petición cancelada",
  canceledBody: "{{name}} canceló esta petición. No hay nada que pagar.",
  expiredTitle: "Petición caducada",
  expiredBody: "Este enlace ya no está abierto. Pide uno nuevo a {{name}}.",
  notFoundTitle: "No se encontró la petición",
  notFoundBody: "Revisa el enlace o pide uno nuevo.",
  loadFailed: "No se pudo cargar esta petición.",
};
