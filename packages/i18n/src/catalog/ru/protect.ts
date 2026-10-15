import type { Catalog } from "../en/index";

export const protect: Catalog["protect"] = {
  title: "Тейк-профит и стоп-лосс",
  takeProfit: "Тейк-профит",
  takeProfitShort: "ТП",
  stopLossShort: "СЛ",
  stopLoss: "Стоп-лосс",
  takeProfitHint: "Закрыть всё, когда {{market}} дойдёт до",
  stopLossHint: "Закрыть всё, когда {{market}} дойдёт до",
  off: "Выкл.",
  save: "Сохранить",
  saved: "Сохранено. Kawase следит за этим.",
  needsGrant:
    "Ещё один шаг: разрешите Kawase закрыть эту позицию за вас, пока вас нет. Она может только закрыть её — в ваш собственный кошелёк.",
  turnOn: "Включить защиту",
  turningOn: "Включаем…",
  grantPrompt: "Разрешить Kawase закрывать позиции за вас",
  onUntil: "Защита включена до {{date}}",
  turnOff: "Выключить",
  armed: "Под наблюдением",
  closing: "Закрываем…",
  unavailable: "Не удалось закрыть по честной цене",
  liquidationNote: "Ликвидация при {{price}}: стоп-лосс должен быть раньше.",
  route: "Закрывается через Uniswap в Arc, выплата в ваш кошелёк.",
  take_profit_wrong_side: "Тейк-профит ставится за сегодняшней ценой: выше для лонга, ниже для шорта.",
  stop_loss_wrong_side: "Стоп-лосс ставится до сегодняшней цены: ниже для лонга, выше для шорта.",
  stop_loss_past_liquidation: "Поставьте стоп-лосс до ликвидации.",
  protection_unavailable:
    "Uniswap в Arc сейчас не может закрыть позицию такого размера, поэтому Kawase этого не обещает.",
  failed: "Не удалось сохранить. Попробуйте ещё раз.",
};
