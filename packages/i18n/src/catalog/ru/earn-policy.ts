import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "Доход в этой сети пока недоступен.",
  ON_OTHER_NETWORK: "Доход работает в {{network}}.",
  PAUSED_ALL: "Вы приостановили все движения денег. Возобновите их в настройках, чтобы продолжить.",
  SIGN_IN_REQUIRED: "Войдите, чтобы получать доход.",
  WALLET_NOT_READY: "Сначала настройте кошелёк.",
  WALLET_NOT_SET_UP: "Сначала настройте кошелёк в этой сети.",
  VAULT_UNAVAILABLE: "Это хранилище здесь недоступно.",
  AMOUNT_MISSING: "Сколько?",
  AMOUNT_INVALID: "Сумма указана неверно.",
  INSUFFICIENT_BALANCE: "Недостаточно USDC. У вас {{balance}}.",
  INSUFFICIENT_GAS: "Оставьте около {{needed}} на комиссию сети.",
  OVER_POSITION: "Это больше, чем у вас в этом хранилище ({{position}}).",
  VAULT_LIQUIDITY_SHORT:
    "Хранилище сейчас может выплатить только {{available}}; остальное выдано в долг. Попробуйте меньше или позже.",
  VAULT_LOW_LIQUIDITY: "Низкая ликвидность: вывод может подождать",
  VAULT_RISK_WARNING: "App Kit отмечает это хранилище: {{warnings}}",
  VAULT_LIQUIDITY_STUCK:
    "Этот сейф сейчас может выплатить только {{available}}, поэтому Kawase не будет вносить в него деньги. Выберите ликвидный.",
};
