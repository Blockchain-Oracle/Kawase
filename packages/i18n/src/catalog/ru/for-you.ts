import type { Catalog } from "../en/index";

export const forYou: Catalog["forYou"] = {
  title: "Для вас",
  loading: "Смотрю, что требует внимания…",
  nothing: "Сейчас ничего не требует вашего внимания.",
  hide: "Скрыть",
  hideThis: "Скрыть это",
  muteKind: "Не показывать такое",
  showAgain: "Снова показывать скрытые типы ({{count}})",
  idleTitle: "{{amount}} USDC лежат без дела",
  idleBody:
    "{{vault}} сейчас платит около {{apy}}% годовых и может сразу вернуть всё. {{keep}} USDC останутся под рукой.",
  idleAction: "Пустить в работу",
  idlePrompt: "Вложи {{amount}} USDC в {{vault}} и оставь {{keep}} USDC в моём кошельке.",
  requestTitle: "Ваш запрос на {{amount}} {{asset}} скоро истекает",
  requestBody: "Осталось около {{hours}} ч. Поделиться ссылкой ещё раз?",
  requestAction: "Поделиться ссылкой",
  bridgeTitle: "Перевод в {{chain}} задерживается",
  bridgeBody: "Прошло {{minutes}} мин; обычно он приходит примерно за минуту. Посмотрите, где он.",
  bridgeAction: "Проверить",
  healthTitle: "Ваш {{side}} по {{market}} близок к ликвидации",
  healthBody:
    "Здоровье {{health}}; ликвидация, если цена сдвинется против вас на {{distance}}. Добавьте маржу или закройте часть позиции.",
  healthAction: "Посмотреть",
  healthPrompt: "У моего {{side}} по {{market}} здоровье {{health}}. Какие у меня варианты?",
  moveTitle: "{{asset}} сегодня изменился на {{change}}",
  moveBody: "Ваши {{held}} {{asset}} в долларах: {{valueChange}} (сейчас {{price}} за штуку).",
  moveAction: "Спросить почему",
  movePrompt: "Почему {{asset}} сегодня изменился на {{change}} и что это значит для моих {{held}} {{asset}}?",
};
