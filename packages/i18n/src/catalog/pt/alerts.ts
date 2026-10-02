import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "Novo acesso em {{name}}",
  deviceSignedInBody: "{{platform}} · {{location}}. Se não foi você, desconecte-o em Aparelhos e ative “Pausar tudo”.",
  deviceSignedInBodyNoPlace: "{{platform}}. Se não foi você, desconecte-o em Aparelhos e ative “Pausar tudo”.",
  deviceSignedOutTitle: "{{name}} foi desconectado",
  deviceSignedOutBody: "Ele não pode mais usar sua conta. Se não foi você, confira Aparelhos agora.",
  invoiceDueSoonTitle: "A fatura {{number}} vence amanhã",
  invoiceDueTodayTitle: "A fatura {{number}} vence hoje",
  invoiceDueBody: "{{client}} deve {{amount}}.",
  invoiceOverdueTitle: "A fatura {{number}} está vencida",
  invoiceOverdueBody: "{{client}} ainda deve {{amount}} (venceu em {{date}}).",
  kindDeviceSignedIn: "Novos acessos",
  kindDeviceSignedOut: "Aparelhos desconectados",
  kindInvoiceDue: "Faturas a vencer",
  kindInvoiceOverdue: "Faturas vencidas",
  aDevice: "um aparelho",
};
