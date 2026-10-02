import type { Catalog } from "../en/index";

export const tokenRules: Catalog["tokenRules"] = {
  title: "Règles des jetons",
  row: "Jetons achetables, plafonds, impact sur le prix",
  intro:
    "Elles s'appliquent à chaque achat : dans les écrans, dans la discussion, à la voix et dans les automatisations.",
  accessTitle: "Quels jetons",
  access_verified: "Vérifiés uniquement",
  access_verifiedBody: "Seulement les jetons dont Kawase se porte garant",
  access_warned: "Vérifiés et populaires, avec avertissements",
  access_warnedBody: "Aussi les jetons non vérifiés, dans les plafonds ci-dessous",
  capsTitle: "Jetons non vérifiés",
  perTrade: "Maximum par transaction",
  perDay: "Maximum par jour",
  usedToday: "{{used}} sur {{cap}} utilisés aujourd'hui",
  capsOff: "Désactivé tant que seuls les jetons vérifiés peuvent être achetés.",
  impactTitle: "Impact sur le prix",
  impactBody: "Un échange qui perdrait plus que cela à cause de l'impact sur le prix est refusé.",
  always: "Les copies, les jetons pièges et les jetons invendables ne sont jamais achetés, quoi que disent ces règles.",
  save: "Enregistrer",
  saveLoosen: "Enregistrer avec Face ID",
  how: "Durcir une règle s'applique tout de suite. L'assouplir demande Face ID, et votre portefeuille signe les nouvelles règles.",
  faceId: "Assouplir vos règles de jetons",
  notChanged: "Rien n'a changé.",
  saved: "Règles des jetons enregistrées",
  failed: "Impossible d'enregistrer les règles. Réessayez.",
  change: "Modifier les règles des jetons",
};
