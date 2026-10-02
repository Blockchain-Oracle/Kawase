import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "Войдите, чтобы торговать.",
  ON_OTHER_NETWORK: "Лонг и шорт работают в сети {{network}}.",
  NOT_AVAILABLE_YET: "Лонг и шорт сейчас недоступны.",
  PAUSED_ALL: "Вы приостановили все движения денег. Возобновите их в Настройках.",
  WALLET_NOT_READY: "Сначала настройте кошелёк.",
  WALLET_NOT_SET_UP: "Сначала настройте кошелёк в этой сети.",
  MARKET_MISSING: "Какой рынок?",
  SIDE_MISSING: "Лонг или шорт?",
  MARGIN_MARKET_UNAVAILABLE:
    "Ни один кредитный рынок не листит {{market}}, поэтому здесь нельзя открыть лонг или шорт. Купите его или поставьте ценовое оповещение.",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} нельзя открыть в {{side}} здесь. Лонг по нему — это обычная покупка.",
  POSITION_MISSING: "Такой открытой позиции нет.",
  AMOUNT_MISSING: "Сколько маржи?",
  AMOUNT_INVALID: "Эта сумма недействительна.",
  INSUFFICIENT_BALANCE: "Недостаточно USDC. У вас {{balance}}.",
  INSUFFICIENT_GAS: "Оставьте около {{needed}} на комиссию сети.",
  LEVERAGE_TOO_HIGH: "Этот рынок позволяет плечо до {{max}}×.",
  QUOTE_UNAVAILABLE: "Сейчас нет цены.",
  MARGIN_RISK: "С плечом можно потерять всю маржу.",
  fixTryAgain: "Попробовать снова",
  fixSwitch: "Перейти в Arc",
  BRAKE_LEVERAGE: "{{leverage}}× выше 5×: небольшое движение против вас может обнулить маржу.",
};
