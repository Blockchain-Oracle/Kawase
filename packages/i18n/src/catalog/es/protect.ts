import type { Catalog } from "../en/index";

export const protect: Catalog["protect"] = {
  title: "Toma de ganancias y stop-loss",
  takeProfit: "Toma de ganancias",
  stopLoss: "Stop-loss",
  takeProfitHint: "Cerrar todo cuando {{market}} llegue a",
  stopLossHint: "Cerrar todo cuando {{market}} llegue a",
  off: "Desactivado",
  save: "Guardar",
  saved: "Guardado. Kawase lo vigila por ti.",
  needsGrant:
    "Un paso más: deja que Kawase cierre esta posición por ti cuando no estés. Solo puede cerrarla, hacia tu propia billetera.",
  turnOn: "Activar protección",
  turningOn: "Activando…",
  grantPrompt: "Deja que Kawase cierre posiciones por ti",
  onUntil: "Protección activa hasta {{date}}",
  turnOff: "Desactivar",
  armed: "Vigilando",
  closing: "Cerrando…",
  unavailable: "No se pudo cerrar a un precio justo",
  liquidationNote: "Liquidación en {{price}}: el stop-loss debe ir antes.",
  route: "Se cierra por Uniswap en Arc, pagado a tu billetera.",
  take_profit_wrong_side:
    "La toma de ganancias va más allá del precio de hoy: por encima en una larga, por debajo en una corta.",
  stop_loss_wrong_side: "El stop-loss va antes del precio de hoy: por debajo en una larga, por encima en una corta.",
  stop_loss_past_liquidation: "Pon el stop-loss antes de la liquidación.",
  protection_unavailable:
    "Uniswap en Arc no puede cerrar el tamaño de esta posición ahora, así que Kawase no lo promete.",
  failed: "No se pudo guardar. Inténtalo de nuevo.",
};
