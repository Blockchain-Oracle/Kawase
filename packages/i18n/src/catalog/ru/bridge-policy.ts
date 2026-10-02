import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "Мост в этой сети пока недоступен.",
  ON_OTHER_NETWORK: "Мост работает в {{network}}.",
  PAUSED_ALL: "Вы приостановили все движения денег. Возобновите их в настройках, чтобы продолжить.",
  SIGN_IN_REQUIRED: "Войдите, чтобы воспользоваться мостом.",
  WALLET_NOT_READY: "Сначала настройте кошелёк.",
  WALLET_NOT_SET_UP: "Сначала настройте кошелёк в этой сети.",
  DESTINATION_MISSING: "В какую сеть?",
  AMOUNT_MISSING: "Сколько?",
  AMOUNT_INVALID: "Сумма указана неверно.",
  INSUFFICIENT_BALANCE: "Недостаточно USDC. У вас {{balance}}.",
  INSUFFICIENT_GAS: "Оставьте около {{needed}} в Arc на комиссию сети.",
  AMOUNT_BELOW_FEE: "Это меньше комиссии маршрута (до {{fee}}). Отправьте больше.",
  QUOTE_UNAVAILABLE: "Сейчас нет маршрута.",
};
