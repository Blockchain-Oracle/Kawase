import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "Nouvelle connexion sur {{name}}",
  deviceSignedInBody:
    "{{platform}} · {{location}}. Si ce n'était pas vous, déconnectez-le dans Appareils et activez « Tout mettre en pause ».",
  deviceSignedInBodyNoPlace:
    "{{platform}}. Si ce n'était pas vous, déconnectez-le dans Appareils et activez « Tout mettre en pause ».",
  deviceSignedOutTitle: "{{name}} a été déconnecté",
  deviceSignedOutBody: "Il ne peut plus utiliser votre compte. Si ce n'est pas vous, vérifiez Appareils dès maintenant.",
  invoiceDueSoonTitle: "La facture {{number}} arrive à échéance demain",
  invoiceDueTodayTitle: "La facture {{number}} arrive à échéance aujourd'hui",
  invoiceDueBody: "{{client}} doit {{amount}}.",
  invoiceOverdueTitle: "La facture {{number}} est en retard",
  invoiceOverdueBody: "{{client}} doit encore {{amount}} (échéance le {{date}}).",
  kindDeviceSignedIn: "Nouvelles connexions",
  kindDeviceSignedOut: "Appareils déconnectés",
  kindInvoiceDue: "Factures arrivant à échéance",
  kindInvoiceOverdue: "Factures en retard",
  aDevice: "un appareil",
};
