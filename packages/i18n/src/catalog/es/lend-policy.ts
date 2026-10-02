import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Inicia sesión para pedir prestado y ganar en Aave.",
  ON_OTHER_NETWORK: "Aave V4 funciona en {{network}}.",
  NOT_AVAILABLE_YET: "Pedir prestado no está disponible ahora.",
  PAUSED_ALL: "Pausaste todos los movimientos de dinero. Reanúdalos en Ajustes para continuar.",
  WALLET_NOT_READY: "Configura tu billetera primero.",
  WALLET_NOT_SET_UP: "Configura tu billetera en esta red primero.",
  ASSET_UNCLEAR: "¿Qué activo?",
  LEND_ASSET_UNAVAILABLE: "Aave V4 no ofrece {{asset}} para esto aquí.",
  LEND_NOT_COLLATERAL: "{{asset}} no se acepta como garantía aquí. Se aceptan cirBTC, WETH y USDC.",
  LEND_NOTHING_OWED: "No debes {{asset}}.",
  AMOUNT_MISSING: "¿Cuánto?",
  AMOUNT_INVALID: "Esa cantidad no es válida.",
  INSUFFICIENT_BALANCE: "No tienes suficiente {{asset}}. Tienes {{balance}}.",
  OVER_POSITION: "Tienes {{position}} en Aave.",
  INSUFFICIENT_GAS: "Guarda un poco de USDC para la comisión de red.",
  HEALTH_TOO_LOW: "La salud quedaría en {{health}}. Kawase la mantiene por encima de {{min}}: pide menos o aporta más.",
  HEALTH_NEAR_LIMIT:
    "La salud quedaría en {{health}}, cerca del límite. Una pequeña caída de precio podría ponerla en riesgo.",
  fixSwitch: "Cambiar a Arc",
};
