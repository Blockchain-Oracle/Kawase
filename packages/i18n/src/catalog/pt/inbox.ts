import type { Catalog } from "../en/index";

export const inbox: Catalog["inbox"] = {
  title: "Caixa de entrada",
  emptyTitle: "Tudo tranquilo",
  emptyBody: "O que precisa de você e o que o Kawase fez aparecerão aqui.",
  receivedFrom: "Recebido de {{name}}",
  requestPaid: "Seu pedido foi pago",
  requestPaidBy: "{{amount}} de {{name}}",
  sentTo: "Enviado para {{name}}",
  unread: "Novo",
  markAllRead: "Marcar tudo como lido",
  loadFailed: "Não foi possível carregar sua caixa de entrada.",
  bellUnread: "Caixa de entrada, {{count}} novos",
};
