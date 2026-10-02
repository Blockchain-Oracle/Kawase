import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "Оплатить {{amount}}",
  signInToPay: "Войдите, чтобы оплатить",
  otherWallet: "Оплатить с другого кошелька",
  otherWalletBody:
    "Отправьте ровно {{amount}} в сети {{network}} на этот адрес. Запрос отметится оплаченным, когда деньги придут.",
  ownRequest: "Это ваш собственный запрос. Отправьте ссылку тому, кто должен заплатить.",
  paidTitle: "Уже оплачен",
  paidBody: "Этот запрос оплачен. Больше ничего делать не нужно.",
  canceledTitle: "Запрос отменён",
  canceledBody: "{{name}} отменил(а) этот запрос. Платить ничего не нужно.",
  expiredTitle: "Срок запроса истёк",
  expiredBody: "Ссылка больше не действует. Попросите у {{name}} новую.",
  notFoundTitle: "Запрос не найден",
  notFoundBody: "Проверьте ссылку или попросите новую.",
  loadFailed: "Не удалось загрузить запрос.",
};
