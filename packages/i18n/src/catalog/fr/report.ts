import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Cette semaine",
  loading: "Préparation de votre semaine…",
  in: "Entrées ({{count}})",
  out: "Sorties ({{count}})",
  swaps: "{{count}} échanges",
  bridges: "{{count}} transferts vers d'autres chaînes",
  earn: "{{count}} mouvements d'épargne",
  services: "{{amount}} pour {{count}} services",
  automations: "Automatisations : {{ran}} exécutées, {{skipped}} ignorées",
  invoices: "{{count}} factures payées ({{amount}})",
  partial: "Seule la partie la plus récente de la semaine a pu être lue.",
};
