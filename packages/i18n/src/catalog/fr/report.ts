import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Cette semaine",
  pnl: "Gain ou perte",
  loading: "Préparation de votre semaine…",
  in: "Entrées ({{count}})",
  out: "Sorties ({{count}})",
  swaps: "{{count}} échanges",
  bridges: "{{count}} transferts vers d'autres chaînes",
  earn: "{{count}} mouvements d'épargne",
  services: "{{amount}} pour {{count}} services",
  automations: "Automatisations : {{ran}} exécutées, {{skipped}} ignorées",
  partial: "Seule la partie la plus récente de la semaine a pu être lue.",
  unread: "L’historique de cette semaine n’a pas pu être lu pour l’instant. Tout ce que Kawase a fait reste ici.",
};
