import type { Catalog } from "../en/index";

export const inbox: Catalog["inbox"] = {
  title: "Bandeja",
  emptyTitle: "Todo en calma",
  emptyBody: "Lo que necesita tu atención y lo que hizo Kawase aparecerá aquí.",
  receivedFrom: "Recibido de {{name}}",
  requestPaid: "Tu petición se pagó",
  requestPaidBy: "{{amount}} de {{name}}",
  sentTo: "Enviado a {{name}}",
  unread: "Nuevo",
  markAllRead: "Marcar todo como leído",
  loadFailed: "No se pudo cargar tu bandeja.",
  bellUnread: "Bandeja, {{count}} nuevos",
};
