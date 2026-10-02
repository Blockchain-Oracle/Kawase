import type { Catalog } from "../en/index";

export const yieldOptions: Catalog["yieldOptions"] = {
  title: "Où {{asset}} rapporte",
  best: "Meilleur",
  outNow: "{{now}} retirable maintenant · taille {{size}}",
  poolSize: "Pool {{size}}",
  apy: "APY",
  apr: "APR en récompenses",
  risk_blue_chip: "Prêt de premier plan",
  risk_curated: "Coffre géré",
  risk_rwa_credit: "Crédit RWA",
  risk_advanced: "Avancé",
  note_low_liquidity: "Peu peut être retiré maintenant",
  note_small_for_amount: "Ne peut pas rendre ce montant maintenant",
  note_advanced: "Les variations de prix peuvent vous laisser moins (perte impermanente)",
  advanced: "Avancé",
  advancedBody:
    "Les récompenses LP sont affichées à titre indicatif : les gagner implique de détenir les deux actifs dans un pool, où les variations de prix peuvent vous laisser moins. Kawase n'y dépose pas.",
  none: "Rien sur Arc ne rapporte sur {{asset}} pour le moment.",
  chooseHint: "Ouvre le dépôt",
  moreWays: "Autres façons de gagner",
};
