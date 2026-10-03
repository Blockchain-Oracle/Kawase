import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "Осталось ~{{n}} действий",
  noneLeft: "Нет USDC на комиссии",
  explain: "Комиссии сети Arc оплачиваются в USDC: столько переводов ещё может оплатить ваш USDC. Когда он закончится, комиссию за переводы USDC и EURC платит Kawase.",
  cardTitle: "Комиссии",
  perTransfer: "Один перевод стоит около {{amount}}",
  relayer: "Если кошелёк не может оплатить комиссию, за переводы USDC и EURC её платит Kawase.",
  loading: "Проверяем запас на комиссии…",
};
