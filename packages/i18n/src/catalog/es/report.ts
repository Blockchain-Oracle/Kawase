import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Esta semana",
  loading: "Preparando tu semana…",
  in: "Entradas ({{count}})",
  out: "Salidas ({{count}})",
  swaps: "{{count}} intercambios",
  bridges: "{{count}} movimientos a otras cadenas",
  earn: "{{count}} movimientos de ahorro",
  services: "{{amount}} en {{count}} servicios",
  automations: "Automatizaciones: {{ran}} ejecutadas, {{skipped}} omitidas",
  invoices: "{{count}} facturas pagadas ({{amount}})",
  partial: "Solo se pudo leer la parte más reciente de esta semana.",
};
