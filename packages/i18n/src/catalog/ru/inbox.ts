import type { Catalog } from "../en/index";

export const inbox: Catalog["inbox"] = {
  title: "Входящие",
  emptyTitle: "Всё спокойно",
  emptyBody: "Здесь появится то, что требует вашего участия, и то, что сделал Kawase.",
  receivedFrom: "Получено от {{name}}",
  requestPaid: "Ваш запрос оплачен",
  requestPaidBy: "{{amount}} от {{name}}",
  sentTo: "Отправлено: {{name}}",
  unread: "Новое",
  markAllRead: "Отметить всё прочитанным",
  loadFailed: "Не удалось загрузить входящие.",
  bellUnread: "Входящие: {{count}} новых",
  askedYou: "{{name}} просит у вас {{amount}}",
  pay: "Оплатить",
};
