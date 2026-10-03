import type { Catalog } from "../en/index";

export const launchpad: Catalog["launchpad"] = {
  onCurve: "На кривой {{launchpad}}: {{percent}}% до выпуска",
  graduated: "Вышел с кривой {{launchpad}}",
  graduatedOn: "Перешёл в обычный пул {{date}}.",
  marketCap: "Капитализация {{amount}}",
  fees: "Сделки на кривой платят {{buy}}% при покупке и {{sell}}% при продаже ({{creator}}% создателю).",
  explainer: "До выпуска цена идёт по кривой бондинга: мало ликвидности, резкие движения, легко потерять.",
  watch: "Сообщить, когда выйдет",
  watching: "Слежу: вы получите оповещение",
};
