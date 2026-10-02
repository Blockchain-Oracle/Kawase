import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "Inicia sesión para operar.",
  ON_OTHER_NETWORK: "Largo y corto funcionan en {{network}}.",
  NOT_AVAILABLE_YET: "Largo y corto no están disponibles ahora.",
  PAUSED_ALL: "Pausaste todo movimiento de dinero. Reanúdalo en Ajustes para continuar.",
  WALLET_NOT_READY: "Configura tu billetera primero.",
  WALLET_NOT_SET_UP: "Configura tu billetera en esta red primero.",
  MARKET_MISSING: "¿Qué mercado?",
  SIDE_MISSING: "¿Largo o corto?",
  MARGIN_MARKET_UNAVAILABLE:
    "Ningún mercado de préstamos lista {{market}}, así que aquí no puede ir largo ni corto. Cómpralo o pon una alerta de precio.",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} no puede ir {{side}} aquí. Ir largo en él es una compra normal.",
  POSITION_MISSING: "No hay ninguna posición abierta así.",
  AMOUNT_MISSING: "¿Cuánto margen?",
  AMOUNT_INVALID: "Esa cantidad no es válida.",
  INSUFFICIENT_BALANCE: "No tienes suficiente USDC. Tienes {{balance}}.",
  INSUFFICIENT_GAS: "Deja unos {{needed}} para la comisión de red.",
  LEVERAGE_TOO_HIGH: "Este mercado permite hasta {{max}}×.",
  QUOTE_UNAVAILABLE: "No hay precio ahora.",
  MARGIN_RISK: "El apalancamiento puede hacerte perder todo el margen.",
  fixTryAgain: "Intentar de nuevo",
  fixSwitch: "Cambiar a Arc",
};
