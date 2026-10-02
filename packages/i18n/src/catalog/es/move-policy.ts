import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "Inicia sesión para mover dinero entre redes.",
  ON_OTHER_NETWORK: "Esto funciona en la otra red.",
  NOT_AVAILABLE_YET: "Mover entre redes no está disponible ahora.",
  PAUSED_ALL: "Pausaste todo movimiento de dinero. Reanúdalo en Ajustes para continuar.",
  WALLET_NOT_READY: "Configura tu billetera primero.",
  WALLET_NOT_SET_UP: "Configura tu billetera en esta red primero.",
  DESTINATION_MISSING: "¿Qué red?",
  RECIPIENT_INVALID: "{{query}} no es una dirección válida.",
  RECIPIENT_UNKNOWN: "¿Quién es {{query}}? Usa un contacto guardado, un @usuario o una dirección.",
  RECIPIENT_NO_WALLET: "@{{handle}} aún no tiene billetera Kawase.",
  RECIPIENT_AMBIGUOUS: "Coincide más de un contacto. ¿Cuál?",
  LOOKALIKE_ADDRESS: "Se parece a la dirección de {{name}}, pero no lo es. Revísala.",
  FIRST_TIME_RECIPIENT: "Primera vez que pagas a esta dirección. Revísala antes de enviar.",
  AMOUNT_MISSING: "¿Cuánto?",
  AMOUNT_INVALID: "Esa cantidad no es válida.",
  INSUFFICIENT_BALANCE: "No hay suficiente USDC allí. Tienes {{balance}}.",
  INSUFFICIENT_GAS: "Deja unos {{needed}} en Arc para la comisión de red.",
  QUOTE_UNAVAILABLE: "Ninguna ruta puede llevarlo ahora.",
};
