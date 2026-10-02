import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "Обмен в этой сети пока недоступен.",
  ON_OTHER_NETWORK: "Обмен работает в {{network}}.",
  PAUSED_ALL: "Вы приостановили все движения денег. Возобновите их в настройках, чтобы продолжить.",
  SIGN_IN_REQUIRED: "Войдите, чтобы обменять.",
  WALLET_NOT_READY: "Сначала настройте кошелёк.",
  WALLET_NOT_SET_UP: "Сначала настройте кошелёк в этой сети.",
  INSUFFICIENT_BALANCE: "Недостаточно денег. У вас {{balance}}.",
  INSUFFICIENT_GAS: "Оставьте около {{needed}} на комиссию сети.",
  AMOUNT_MISSING: "Сколько?",
  AMOUNT_INVALID: "Сумма указана неверно.",
  ASSET_UNCLEAR: "Из USDC или EURC?",
  SWAP_SAME_TOKEN: "Выберите две разные валюты.",
  SWAP_PAIR_UNSUPPORTED: "Kawase не может обменять их здесь.",
  QUOTE_UNAVAILABLE: "Сейчас нет цены.",
  PRICE_IMPACT_HIGH:
    "Эта цена на {{gap}}% ниже рынка — больше допустимых в Kawase {{max}}%. Попробуйте меньшую сумму или подождите.",
  RATE_BELOW_REFERENCE: "Эта цена на {{gap}}% ниже рыночного курса.",
  fixTryAgain: "Повторить",
};
