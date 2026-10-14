import type { Catalog } from "../en/index";

export const yieldOptions: Catalog["yieldOptions"] = {
  title: "Onde {{asset}} rende",
  best: "Melhor",
  outNow: "{{now}} sacável agora · tamanho {{size}}",
  poolSize: "Pool {{size}}",
  apy: "APY",
  apr: "APR em recompensas",
  risk_blue_chip: "Empréstimo de primeira linha",
  risk_curated: "Cofre curado",
  risk_rwa_credit: "Crédito RWA",
  risk_advanced: "Avançado",
  note_low_liquidity: "Pouco pode ser sacado agora",
  note_small_for_amount: "Não consegue devolver este valor agora",
  note_advanced: "Variações de preço podem deixar você com menos (perda impermanente)",
  advanced: "Avançado",
  advancedBody:
    "Recompensas de LP aparecem como referência: ganhá-las significa manter os dois ativos em um pool, onde variações de preço podem deixar você com menos. A Kawase não deposita nelas.",
  none: "Nada na Arc rende sobre {{asset}} agora.",
  chooseHint: "Abre o depósito",
  moreWays: "Mais formas de render",
  earnWith: "Render com {{name}}",
};
