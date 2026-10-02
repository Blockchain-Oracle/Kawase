import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Entre para pegar emprestado e render no Aave.",
  ON_OTHER_NETWORK: "O Aave V4 funciona na {{network}}.",
  NOT_AVAILABLE_YET: "Empréstimos não estão disponíveis agora.",
  PAUSED_ALL: "Você pausou toda movimentação de dinheiro. Retome em Ajustes para continuar.",
  WALLET_NOT_READY: "Configure sua carteira primeiro.",
  WALLET_NOT_SET_UP: "Configure sua carteira nesta rede primeiro.",
  ASSET_UNCLEAR: "Qual ativo?",
  LEND_ASSET_UNAVAILABLE: "O Aave V4 não oferece {{asset}} para isso aqui.",
  LEND_NOT_COLLATERAL: "{{asset}} não é aceito como garantia aqui. cirBTC, WETH e USDC são.",
  LEND_NOTHING_OWED: "Você não deve nenhum {{asset}}.",
  AMOUNT_MISSING: "Quanto?",
  AMOUNT_INVALID: "Esse valor não é válido.",
  INSUFFICIENT_BALANCE: "{{asset}} insuficiente. Você tem {{balance}}.",
  OVER_POSITION: "Você tem {{position}} no Aave.",
  INSUFFICIENT_GAS: "Guarde um pouco de USDC para a taxa de rede.",
  HEALTH_TOO_LOW: "A saúde iria para {{health}}. A Kawase a mantém acima de {{min}}: pegue menos ou coloque mais.",
  HEALTH_NEAR_LIMIT:
    "A saúde ficaria em {{health}}, perto do limite. Uma pequena queda de preço pode colocá-la em risco.",
  fixSwitch: "Mudar para Arc",
};
