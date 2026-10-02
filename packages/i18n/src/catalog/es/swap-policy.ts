import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "Intercambiar aún no está disponible en esta red.",
  ON_OTHER_NETWORK: "Intercambiar funciona en {{network}}.",
  PAUSED_ALL: "Pausaste todos los movimientos de dinero. Reanúdalos en Ajustes para continuar.",
  SIGN_IN_REQUIRED: "Inicia sesión para intercambiar.",
  WALLET_NOT_READY: "Primero configura tu billetera.",
  WALLET_NOT_SET_UP: "Primero configura tu billetera en esta red.",
  INSUFFICIENT_BALANCE: "No tienes suficiente. Tienes {{balance}}.",
  INSUFFICIENT_GAS: "Deja unos {{needed}} para la comisión de red.",
  AMOUNT_MISSING: "¿Cuánto?",
  AMOUNT_INVALID: "Ese importe no es válido.",
  ASSET_UNCLEAR: "¿Desde USDC o EURC?",
  SWAP_SAME_TOKEN: "Elige dos monedas distintas.",
  SWAP_PAIR_UNSUPPORTED: "Kawase no puede intercambiar estas aquí.",
  QUOTE_UNAVAILABLE: "No hay precio ahora.",
  PRICE_IMPACT_HIGH:
    "Este precio está un {{gap}} % por debajo del mercado, más del {{max}} % que permite Kawase. Prueba con menos o espera.",
  RATE_BELOW_REFERENCE: "Este precio está un {{gap}} % por debajo del tipo de mercado.",
  fixTryAgain: "Reintentar",
};
