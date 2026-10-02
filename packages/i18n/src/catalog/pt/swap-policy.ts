import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "Trocar ainda não está disponível nesta rede.",
  ON_OTHER_NETWORK: "Trocar funciona na {{network}}.",
  PAUSED_ALL: "Você pausou toda a movimentação de dinheiro. Retome em Ajustes para continuar.",
  SIGN_IN_REQUIRED: "Entre para trocar.",
  WALLET_NOT_READY: "Configure sua carteira primeiro.",
  WALLET_NOT_SET_UP: "Configure sua carteira nesta rede primeiro.",
  INSUFFICIENT_BALANCE: "Dinheiro insuficiente. Você tem {{balance}}.",
  INSUFFICIENT_GAS: "Deixe cerca de {{needed}} para a taxa da rede.",
  AMOUNT_MISSING: "Quanto?",
  AMOUNT_INVALID: "Esse valor não é válido.",
  ASSET_UNCLEAR: "De USDC ou EURC?",
  SWAP_SAME_TOKEN: "Escolha duas moedas diferentes.",
  SWAP_PAIR_UNSUPPORTED: "O Kawase não consegue trocar essas aqui.",
  QUOTE_UNAVAILABLE: "Sem preço agora.",
  PRICE_IMPACT_HIGH:
    "Este preço está {{gap}}% abaixo do mercado, mais que os {{max}}% que o Kawase permite. Tente um valor menor ou espere.",
  RATE_BELOW_REFERENCE: "Este preço está {{gap}}% abaixo da cotação de mercado.",
  fixTryAgain: "Tentar de novo",
  BRAKE_PRICE_IMPACT: "Este preço está {{gap}}% abaixo do mercado, acima da sua regra de {{max}}%.",
};
