import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "A ponte ainda não está disponível nesta rede.",
  ON_OTHER_NETWORK: "A ponte funciona na {{network}}.",
  PAUSED_ALL: "Você pausou toda a movimentação de dinheiro. Retome em Ajustes para continuar.",
  SIGN_IN_REQUIRED: "Entre para usar a ponte.",
  WALLET_NOT_READY: "Configure sua carteira primeiro.",
  WALLET_NOT_SET_UP: "Configure sua carteira nesta rede primeiro.",
  DESTINATION_MISSING: "Para qual rede?",
  AMOUNT_MISSING: "Quanto?",
  AMOUNT_INVALID: "Esse valor não é válido.",
  INSUFFICIENT_BALANCE: "USDC insuficiente. Você tem {{balance}}.",
  INSUFFICIENT_GAS: "Deixe cerca de {{needed}} na Arc para a taxa da rede.",
  AMOUNT_BELOW_FEE: "É menos que a taxa da rota, de até {{fee}}. Envie mais.",
  QUOTE_UNAVAILABLE: "Sem rota agora.",
};
