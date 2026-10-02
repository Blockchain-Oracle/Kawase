import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "Nuevo inicio de sesión en {{name}}",
  deviceSignedInBody:
    "{{platform}} · {{location}}. Si no fuiste tú, cierra su sesión en Dispositivos y activa «Pausar todo».",
  deviceSignedInBodyNoPlace: "{{platform}}. Si no fuiste tú, cierra su sesión en Dispositivos y activa «Pausar todo».",
  deviceSignedOutTitle: "Se cerró la sesión en {{name}}",
  deviceSignedOutBody: "Ya no puede usar tu cuenta. Si no fuiste tú, revisa Dispositivos ahora.",
  invoiceDueSoonTitle: "La factura {{number}} vence mañana",
  invoiceDueTodayTitle: "La factura {{number}} vence hoy",
  invoiceDueBody: "{{client}} debe {{amount}}.",
  invoiceOverdueTitle: "La factura {{number}} está vencida",
  invoiceOverdueBody: "{{client}} aún debe {{amount}} (vencía el {{date}}).",
  kindDeviceSignedIn: "Nuevos inicios de sesión",
  kindDeviceSignedOut: "Sesiones cerradas en dispositivos",
  kindInvoiceDue: "Facturas por vencer",
  kindInvoiceOverdue: "Facturas vencidas",
  aDevice: "un dispositivo",
};
