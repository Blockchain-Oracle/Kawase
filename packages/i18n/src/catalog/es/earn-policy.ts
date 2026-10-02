import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "Ganar aún no está disponible en esta red.",
  ON_OTHER_NETWORK: "Ganar funciona en {{network}}.",
  PAUSED_ALL: "Pausaste todos los movimientos de dinero. Reanúdalos en Ajustes para continuar.",
  SIGN_IN_REQUIRED: "Inicia sesión para ganar.",
  WALLET_NOT_READY: "Primero configura tu billetera.",
  WALLET_NOT_SET_UP: "Primero configura tu billetera en esta red.",
  VAULT_UNAVAILABLE: "Este fondo no está disponible aquí.",
  AMOUNT_MISSING: "¿Cuánto?",
  AMOUNT_INVALID: "Ese importe no es válido.",
  INSUFFICIENT_BALANCE: "No tienes suficientes USDC. Tienes {{balance}}.",
  INSUFFICIENT_GAS: "Deja unos {{needed}} para la comisión de red.",
  OVER_POSITION: "Es más de lo que tienes en este fondo ({{position}}).",
  VAULT_LIQUIDITY_SHORT:
    "El fondo solo puede pagar {{available}} ahora; el resto está prestado. Prueba con menos o más tarde.",
  VAULT_LOW_LIQUIDITY: "Liquidez baja: los retiros pueden tener que esperar",
  VAULT_RISK_WARNING: "App Kit marca este fondo: {{warnings}}",
};
