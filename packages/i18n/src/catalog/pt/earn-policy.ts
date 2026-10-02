import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "Render ainda não está disponível nesta rede.",
  ON_OTHER_NETWORK: "Render funciona na {{network}}.",
  PAUSED_ALL: "Você pausou toda a movimentação de dinheiro. Retome em Ajustes para continuar.",
  SIGN_IN_REQUIRED: "Entre para render.",
  WALLET_NOT_READY: "Configure sua carteira primeiro.",
  WALLET_NOT_SET_UP: "Configure sua carteira nesta rede primeiro.",
  VAULT_UNAVAILABLE: "Este cofre não está disponível aqui.",
  AMOUNT_MISSING: "Quanto?",
  AMOUNT_INVALID: "Esse valor não é válido.",
  INSUFFICIENT_BALANCE: "USDC insuficiente. Você tem {{balance}}.",
  INSUFFICIENT_GAS: "Deixe cerca de {{needed}} para a taxa da rede.",
  OVER_POSITION: "É mais do que você tem neste cofre ({{position}}).",
  VAULT_LIQUIDITY_SHORT:
    "O cofre só pode pagar {{available}} agora; o resto está emprestado. Tente menos ou mais tarde.",
  VAULT_LOW_LIQUIDITY: "Liquidez baixa: saques podem ter que esperar",
  VAULT_RISK_WARNING: "O App Kit sinaliza este cofre: {{warnings}}",
  VAULT_LIQUIDITY_STUCK:
    "Este cofre só pode pagar {{available}} agora, então o Kawase não vai depositar nele. Escolha um com liquidez.",
};
