import type { Catalog } from "../en/index";

export const scan: Catalog["scan"] = {
  title: "Escanear para pagar",
  fanLabel: "Escanear",
  body: "Apunta a un QR de pago: una dirección, un enlace de pago o una solicitud de Kawase.",
  reading: "Leyendo el código…",
  failed: "No se pudo leer ese código. Inténtalo de nuevo o pégalo.",
  paste: "Pegar en su lugar",
  torch: "Linterna",
  allow: "Permitir la cámara",
  allowBody: "Kawase usa la cámara para escanear códigos de pago. También puedes pegar uno.",
  deniedBody: "La cámara está desactivada para Kawase. Actívala en Ajustes o pega el código.",
  openSettings: "Abrir Ajustes",
  again: "Escanear de nuevo",
  otherNetwork: "Este código es para {{network}}. Cambia para pagarlo allí.",
  otherChain: "Este código pide un pago en {{chain}}. Kawase paga en Arc; pídeles una dirección de Arc.",
  otherChainUnknown: "Este código pide un pago en otra cadena. Kawase paga en Arc; pídeles una dirección de Arc.",
  unsupportedAsset: "Este código pide un token que no está en esta red.",
  requestClosed: "Esta solicitud ya está pagada, vencida o cancelada.",
  notFound: "Ninguna solicitud de Kawase coincide con este enlace.",
  notPayment: "Esto no es un código de pago.",
  chatPrompt: "Paga esto: {{code}}",
};
