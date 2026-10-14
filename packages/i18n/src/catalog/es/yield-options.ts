import type { Catalog } from "../en/index";

export const yieldOptions: Catalog["yieldOptions"] = {
  title: "Dónde rinde {{asset}}",
  best: "Mejor",
  outNow: "{{now}} disponible ya · tamaño {{size}}",
  poolSize: "Pool {{size}}",
  apy: "APY",
  apr: "APR en recompensas",
  risk_blue_chip: "Préstamo de primera línea",
  risk_curated: "Bóveda curada",
  risk_rwa_credit: "Crédito RWA",
  risk_advanced: "Avanzado",
  note_low_liquidity: "Ahora se puede retirar poco",
  note_small_for_amount: "Ahora no puede devolver esta cantidad",
  note_advanced: "Los cambios de precio pueden dejarte con menos (pérdida impermanente)",
  advanced: "Avanzado",
  advancedBody:
    "Las recompensas de LP se muestran como referencia: ganarlas implica tener ambos activos en un pool, donde los cambios de precio pueden dejarte con menos. Kawase no deposita en ellos.",
  none: "Ahora nada en Arc paga rendimiento por {{asset}}.",
  chooseHint: "Abre el depósito",
  moreWays: "Más formas de ganar",
  earnWith: "Ganar con {{name}}",
};
