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
};
