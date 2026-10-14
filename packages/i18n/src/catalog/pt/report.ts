import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Esta semana",
  loading: "Montando sua semana…",
  in: "Entradas ({{count}})",
  out: "Saídas ({{count}})",
  swaps: "{{count}} trocas",
  bridges: "{{count}} transferências para outras redes",
  earn: "{{count}} movimentações de poupança",
  services: "{{amount}} em {{count}} serviços",
  automations: "Automações: {{ran}} executadas, {{skipped}} puladas",
  partial: "Só foi possível ler a parte mais recente desta semana.",
};
