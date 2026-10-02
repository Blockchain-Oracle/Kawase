import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "El puente aún no está disponible en esta red.",
  ON_OTHER_NETWORK: "El puente funciona en {{network}}.",
  PAUSED_ALL: "Pausaste todos los movimientos de dinero. Reanúdalos en Ajustes para continuar.",
  SIGN_IN_REQUIRED: "Inicia sesión para usar el puente.",
  WALLET_NOT_READY: "Primero configura tu billetera.",
  WALLET_NOT_SET_UP: "Primero configura tu billetera en esta red.",
  DESTINATION_MISSING: "¿A qué cadena?",
  AMOUNT_MISSING: "¿Cuánto?",
  AMOUNT_INVALID: "Ese importe no es válido.",
  INSUFFICIENT_BALANCE: "No tienes suficientes USDC. Tienes {{balance}}.",
  INSUFFICIENT_GAS: "Deja unos {{needed}} en Arc para la comisión de red.",
  AMOUNT_BELOW_FEE: "Es menos que la comisión de la ruta, de hasta {{fee}}. Envía más.",
  QUOTE_UNAVAILABLE: "No hay ruta ahora.",
};
