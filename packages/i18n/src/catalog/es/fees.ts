import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}} acciones restantes",
  noneLeft: "Sin USDC para comisiones",
  explain: "Las comisiones de red en Arc se pagan en USDC; esto es cuántos envíos puede pagar aún tu USDC. Si se agota, Kawase paga la comisión de tus envíos de USDC y EURC.",
  cardTitle: "Comisiones",
  perTransfer: "Un envío cuesta unos {{amount}}",
  relayer: "Si tu billetera no puede pagar una comisión, Kawase la paga en los envíos de USDC y EURC.",
  loading: "Revisando tu reserva para comisiones…",
};
