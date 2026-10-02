import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "Red de pruebas",
  receivedTitle: "Recibiste {{amount}}",
  receivedBody: "De {{name}}",
  requestPaidTitle: "Tu petición se pagó",
  requestPaidBody: "{{amount}} de {{name}}",
  sentTitle: "Enviaste {{amount}}",
  sentBody: "A {{name}}",
  skippedTitle: "Se saltó una automatización",
  skippedBody: "No se envió nada. Abre Kawase para ver por qué.",
  emailOpen: "Abrir Kawase",
  emailNeverApprove: "Kawase nunca te pide aprobar ni firmar nada por email.",
  emailWhy: "Recibes esto porque lo tienes activado en Kawase. Cámbialo en Ajustes → Notificaciones.",
};
