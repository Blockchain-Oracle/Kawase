import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Войдите, чтобы занимать и получать доход в Aave.",
  ON_OTHER_NETWORK: "Aave V4 работает в сети {{network}}.",
  NOT_AVAILABLE_YET: "Заём сейчас недоступен.",
  PAUSED_ALL: "Вы приостановили все движения денег. Возобновите их в Настройках, чтобы продолжить.",
  WALLET_NOT_READY: "Сначала настройте кошелёк.",
  WALLET_NOT_SET_UP: "Сначала настройте кошелёк в этой сети.",
  ASSET_UNCLEAR: "Какой актив?",
  LEND_ASSET_UNAVAILABLE: "Aave V4 здесь не предлагает {{asset}} для этого.",
  LEND_NOT_COLLATERAL: "{{asset}} здесь не принимается в залог. Принимаются cirBTC, WETH и USDC.",
  LEND_NOTHING_OWED: "Вы не должны {{asset}}.",
  AMOUNT_MISSING: "Сколько?",
  AMOUNT_INVALID: "Эта сумма недействительна.",
  INSUFFICIENT_BALANCE: "Недостаточно {{asset}}. У вас {{balance}}.",
  OVER_POSITION: "У вас {{position}} в Aave.",
  INSUFFICIENT_GAS: "Оставьте немного USDC на комиссию сети.",
  HEALTH_TOO_LOW: "Здоровье упало бы до {{health}}. Kawase держит его выше {{min}}: займите меньше или внесите больше.",
  HEALTH_NEAR_LIMIT:
    "Здоровье будет {{health}}, близко к пределу. Небольшое падение цены может поставить его под угрозу.",
  fixSwitch: "Переключиться на Arc",
};
