import type { Catalog } from "../en/index";

export const inbox: Catalog["inbox"] = {
  title: "Boîte de réception",
  emptyTitle: "Tout est calme",
  emptyBody: "Ce qui vous attend et ce que Kawase a fait apparaîtra ici.",
  receivedFrom: "Reçu de {{name}}",
  requestPaid: "Votre demande a été payée",
  requestPaidBy: "{{amount}} de {{name}}",
  sentTo: "Envoyé à {{name}}",
  unread: "Nouveau",
  markAllRead: "Tout marquer comme lu",
  loadFailed: "Impossible de charger votre boîte de réception.",
  bellUnread: "Boîte de réception, {{count}} nouveaux",
  askedYou: "{{name}} vous demande {{amount}}",
  remindedYou: "Rappel : {{name}} vous demande {{amount}}",
  pay: "Payer",
};
