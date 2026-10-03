import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "Получить",
  warning: "Только USDC и EURC в сети Arc. Деньги, отправленные в других сетях, Kawase не видит.",
  copy: "Скопировать адрес",
  share: "Поделиться",
  network: "Сеть",
  shareMessage: "Мой адрес Kawase в сети {{network}}: {{address}}",
  askAmount: "Запросить сумму",
  askAsset: "Актив",
  askShow: "Показать код",
  askHint: "Любой кошелёк, отсканировав его, подставит {{amount}} в {{network}}.",
  askClear: "Убрать сумму",
  shareAsk: "Отправь мне {{amount}} в {{network}}: {{address}}\n{{uri}}",
  noWallet: "Войдите, чтобы получить адрес",
  noWalletBody: "Адрес создаётся вместе с аккаунтом.",
  setUpFirst: "Сначала настройте кошелёк",
  setUpFirstBody: "Один шаг — и адрес готов принимать деньги.",
  anyToken:
    "Сюда приходит любой токен в Arc. Отправили в другой сети? Деньги придут на этот же адрес там: переведите их в Arc через «Пополнить».",
};
