import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "Кошелёк",
  creating: "Создаём ваш кошелёк…",
  settingUp: "Настраиваем кошелёк в сети {{network}}…",
  ready: "Кошелёк готов",
  address: "Адрес",
  balance: "Баланс",
  noWallet: "Войдите, чтобы получить кошелёк",
  setupNeeded: "Настроить в сети {{network}}",
  setUp: "Настроить",
  allowanceTitle: "Дневной лимит",
  allowanceBody:
    "Kawase может отправлять за вас до {{amount}} в день, не спрашивая. Сверх этого вы подтверждаете через Face ID.",
  allowanceBodyAndroid:
    "Kawase может отправлять за вас до {{amount}} в день, не спрашивая. Сверх этого вы подтверждаете отпечатком пальца или блокировкой экрана.",
  allowanceAccept: "Принять",
  allowanceAcceptFaceId: "Принять через Face ID",
  allowanceActive: "Включён · {{amount}} в день",
  allowanceOff: "Выключен",
  allowanceRevoke: "Выключить",
  mainnetConsentTitle: "Настоящие деньги",
  mainnetConsentBody:
    "Основная сеть использует настоящие USDC. Kawase распоряжается ими только в заданных вами пределах и никогда сверх лимита без вашего Face ID.",
  mainnetConsentBodyWeb:
    "В мейннете используются настоящие USDC. Kawase переводит их только в пределах ваших лимитов и никогда сверх дневного лимита без вашего подтверждения.",
  mainnetConsentBodyAndroid:
    "Основная сеть использует настоящие USDC. Kawase распоряжается ими только в заданных вами пределах и никогда сверх лимита без вашего отпечатка пальца или блокировки экрана.",
  mainnetConsentAccept: "Понятно",
  testnetMoney: "Тестовые USDC ничего не стоят.",
  confirmInBrowser: "Ваш кошелёк подписывает в этом браузере. Ничего не подписывается, пока вы не подтвердите.",
  exportKeyTitle: "Ваш закрытый ключ — это и есть ваш кошелёк",
  exportKeyWarning1: "Любой, у кого есть этот ключ, может забрать всё из вашего кошелька в любом приложении.",
  exportKeyWarning2: "Kawase никогда его не попросит. Никогда не вставляйте его на сайте или в чате.",
  exportKeyWindow: "Он открывается в защищённом окне Privy. Kawase его никогда не видит.",
  exportKeyOnWeb: "Он открывается на сайте Kawase. Войдите там с той же почтой, и защищённое окно Privy покажет его.",
  exportKeyReveal: "Показать закрытый ключ",
  exportKeyOpenWeb: "Экспортировать на сайте",
  oauthReturnTitle: "Завершаем вход",
  oauthReturnGoogle: "Через ваш аккаунт Google",
  oauthReturnApple: "Через ваш аккаунт Apple",
};
