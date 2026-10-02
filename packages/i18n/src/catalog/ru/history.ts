import type { Catalog } from "../en/index";

export const history: Catalog["history"] = {
  export: "Экспорт",
  exportTitle: "Экспорт истории",
  exportBody:
    "CSV для таблиц, Beancount для учёта в текстовом формате. Включает то, что ваш агент заплатил за сервисы.",
  exportPartial:
    "В том месяце было больше операций, чем читает один экспорт; в файле самые последние.",
};
