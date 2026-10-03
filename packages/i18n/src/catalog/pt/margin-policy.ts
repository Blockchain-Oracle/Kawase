import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "Entre para negociar.",
  ON_OTHER_NETWORK: "Comprado e vendido funcionam na {{network}}.",
  NOT_AVAILABLE_YET: "Comprado e vendido não estão disponíveis agora.",
  PAUSED_ALL: "Você pausou toda movimentação de dinheiro. Retome em Ajustes para continuar.",
  WALLET_NOT_READY: "Configure sua carteira primeiro.",
  WALLET_NOT_SET_UP: "Configure sua carteira nesta rede primeiro.",
  MARKET_MISSING: "Qual mercado?",
  SIDE_MISSING: "Comprado ou vendido?",
  MARGIN_MARKET_UNAVAILABLE:
    "Nenhum mercado de empréstimo lista {{market}}, então aqui não dá para ficar comprado nem vendido. Compre, ou crie um alerta de preço.",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} não pode ficar {{side}} aqui. Ficar comprado nele é uma compra comum.",
  POSITION_MISSING: "Não há posição aberta assim.",
  AMOUNT_MISSING: "Quanto de margem?",
  AMOUNT_INVALID: "Esse valor não é válido.",
  INSUFFICIENT_BALANCE: "USDC insuficiente. Você tem {{balance}}.",
  INSUFFICIENT_GAS: "Deixe cerca de {{needed}} para a taxa de rede.",
  LEVERAGE_TOO_HIGH: "Este mercado permite até {{max}}×.",
  QUOTE_UNAVAILABLE: "Sem preço agora.",
  MARGIN_RISK: "A alavancagem pode fazer você perder toda a margem.",
  fixTryAgain: "Tentar de novo",
  fixSwitch: "Mudar para Arc",
  BRAKE_LEVERAGE: "{{leverage}}× passa de 5×: um pequeno movimento contra você pode zerar a margem.",
};
