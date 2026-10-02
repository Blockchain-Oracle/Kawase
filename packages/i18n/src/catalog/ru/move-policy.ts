import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "Войдите, чтобы переводить деньги между сетями.",
  ON_OTHER_NETWORK: "Это работает в другой сети.",
  NOT_AVAILABLE_YET: "Переводы между сетями сейчас недоступны.",
  PAUSED_ALL: "Вы приостановили все движения денег. Возобновите их в Настройках.",
  WALLET_NOT_READY: "Сначала настройте кошелёк.",
  WALLET_NOT_SET_UP: "Сначала настройте кошелёк в этой сети.",
  DESTINATION_MISSING: "Какая сеть?",
  RECIPIENT_INVALID: "{{query}} — недействительный адрес.",
  RECIPIENT_UNKNOWN: "Кто такой {{query}}? Укажите контакт, @ник или адрес.",
  RECIPIENT_NO_WALLET: "У @{{handle}} пока нет кошелька Kawase.",
  RECIPIENT_AMBIGUOUS: "Подходит несколько контактов. Какой?",
  LOOKALIKE_ADDRESS: "Похоже на адрес {{name}}, но это не он. Проверьте.",
  FIRST_TIME_RECIPIENT: "Первый платёж на этот адрес. Проверьте перед отправкой.",
  AMOUNT_MISSING: "Сколько?",
  AMOUNT_INVALID: "Эта сумма недействительна.",
  INSUFFICIENT_BALANCE: "Там недостаточно USDC. У вас {{balance}}.",
  INSUFFICIENT_GAS: "Оставьте около {{needed}} в Arc на комиссию сети.",
  QUOTE_UNAVAILABLE: "Сейчас ни один маршрут не может это перевести.",
};
