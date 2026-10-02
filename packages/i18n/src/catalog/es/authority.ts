import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "Kawase puede",
  never: "Kawase nunca puede",
  worst: "En el peor caso",
  canSendDaily: "Enviar hasta {{amount}} al día desde tu billetera",
  canSendPeriod: "Enviar hasta {{amount}} por periodo desde tu billetera",
  canNoPrompt: "Hacerlo sin preguntarte cada vez",
  neverMore: "Enviar más de {{amount}} en un día",
  neverOtherTokens: "Tocar cualquier otro token o contrato",
  neverLimits: "Cambiar tus límites o este permiso",
  worstCase: "Si todo saliera mal, como máximo saldrían {{amount}} en un día, y puedes desactivarlo cuando quieras.",
  meta: "{{network}} · hasta el {{date}}",
  unknownTerms: "Este permiso tiene condiciones que Kawase no puede leer. No confíes en este resumen.",
};
