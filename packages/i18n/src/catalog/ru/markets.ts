import type { Catalog } from "../en/index";

export const markets: Catalog["markets"] = {
  dock: "Рынки",
  title: "Рынки",
  search: "Поиск токенов",
  trending: "В тренде",
  meme: "Мемы",
  perps: "Лонг/шорт",
  fx: "Акции и валюты",
  new: "Новые",
  hot: "Самое горячее",
  heatmap: "Тепловая карта",
  vol: "Объём {{value}}",
  liq: "Ликв. {{value}}",
  mcap: "Кап. {{value}}",
  testnetTitle: "Рынки работают в mainnet",
  testnetBody:
    "Тестовые деньги меняются только на USDC и EURC. Переключитесь на mainnet, чтобы увидеть настоящие рынки.",
  switchToMainnet: "Переключиться на mainnet",
  empty: "Сейчас здесь пусто",
  loadFailed: "Не удалось загрузить рынки.",
  updated: "Обновлено {{time}}",
  stale: "Последние цены на {{time}}",
  recentSearches: "Недавние поиски",
  segmentsLabel: "Разделы рынка",
  yourPositions: "Ваши позиции",
  marginVenue: "Kawase Margin · Aave V4 в Arc",
  perpsMainnet:
    "Лонг и шорт работают в основной сети Arc. Переключите сеть, чтобы торговать; ваши тестовые деньги останутся как есть.",
};
