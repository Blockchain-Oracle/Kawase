import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Esta semana",
  pnl: "Lucro ou prejuízo",
  loading: "Montando sua semana…",
  in: "Entradas ({{count}})",
  out: "Saídas ({{count}})",
  swaps: "{{count}} trocas",
  bridges: "{{count}} transferências para outras redes",
  earn: "{{count}} movimentações de poupança",
  services: "{{amount}} em {{count}} serviços",
  automations: "Automações: {{ran}} executadas, {{skipped}} puladas",
  partial: "Só foi possível ler a parte mais recente desta semana.",
  unread: "Não foi possível ler o histórico desta semana agora. Tudo o que o Kawase fez continua aqui.",
};
