import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}} ações restantes",
  noneLeft: "Sem USDC para taxas",
  explain: "As taxas de rede na Arc são pagas em USDC; isto é quantos envios seu USDC ainda pode pagar. Quando acabar, a Kawase paga a taxa dos seus envios de USDC e EURC.",
  cardTitle: "Taxas",
  perTransfer: "Um envio custa cerca de {{amount}}",
  relayer: "Se sua carteira não puder pagar uma taxa, a Kawase paga nos envios de USDC e EURC.",
  loading: "Verificando sua reserva para taxas…",
};
