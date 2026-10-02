import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Получить",
  warning: "Только USDC и EURC в сети Arc. Деньги, отправленные в других сетях, Kawase не видит.",
  copy: "Скопировать адрес",
  share: "Поделиться",
  network: "Сеть",
  shareMessage: "Мой адрес Kawase в сети {{network}}: {{address}}",
  noWallet: "Войдите, чтобы получить адрес",
  noWalletBody: "Адрес создаётся вместе с аккаунтом.",
  setUpFirst: "Сначала настройте кошелёк",
  setUpFirstBody: "Один шаг — и адрес готов принимать деньги.",
};
