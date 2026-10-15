import type { Catalog } from "../en/index";

export const protect: Catalog["protect"] = {
  title: "Prise de profit et stop-loss",
  takeProfit: "Prise de profit",
  takeProfitShort: "TP",
  stopLossShort: "SL",
  stopLoss: "Stop-loss",
  takeProfitHint: "Tout clôturer quand {{market}} atteint",
  stopLossHint: "Tout clôturer quand {{market}} arrive à",
  off: "Désactivé",
  save: "Enregistrer",
  saved: "Enregistré. Kawase surveille pour vous.",
  needsGrant:
    "Encore une étape : laissez Kawase clôturer cette position pour vous en votre absence. Il ne peut que la clôturer, vers votre propre portefeuille.",
  turnOn: "Activer la protection",
  turningOn: "Activation…",
  grantPrompt: "Laisser Kawase clôturer des positions pour vous",
  onUntil: "Protection active jusqu'au {{date}}",
  turnOff: "Désactiver",
  armed: "Surveillée",
  closing: "Clôture…",
  unavailable: "Clôture impossible à un prix juste",
  liquidationNote: "Liquidation à {{price}} : le stop-loss doit venir avant.",
  route: "Se clôture via Uniswap sur Arc, payé à votre portefeuille.",
  take_profit_wrong_side:
    "Une prise de profit se place au-delà du prix actuel : au-dessus pour une longue, en dessous pour une courte.",
  stop_loss_wrong_side:
    "Un stop-loss se place avant le prix actuel : en dessous pour une longue, au-dessus pour une courte.",
  stop_loss_past_liquidation: "Placez le stop-loss avant la liquidation.",
  protection_unavailable:
    "Uniswap sur Arc ne peut pas clôturer la taille de cette position pour le moment, Kawase ne le promet donc pas.",
  failed: "Enregistrement impossible. Réessayez.",
};
