import type { Catalog } from "../en/index";

export const forYou: Catalog["forYou"] = {
  title: "Pour vous",
  loading: "Je regarde ce qui demande votre attention…",
  nothing: "Rien ne demande votre attention pour l’instant.",
  hide: "Masquer",
  hideThis: "Masquer ceci",
  muteKind: "Ne plus montrer ce type",
  showAgain: "Réafficher les types masqués ({{count}})",
  idleTitle: "{{amount}} USDC dorment",
  idleBody:
    "{{vault}} rapporte environ {{apy}} % par an en ce moment et peut tout rendre aussitôt. {{keep}} USDC restent prêts à dépenser.",
  idleAction: "Les faire fructifier",
  idlePrompt: "Place {{amount}} USDC dans {{vault}} et garde {{keep}} USDC dans mon portefeuille.",
  requestTitle: "Votre demande de {{amount}} {{asset}} expire bientôt",
  requestBody: "Il reste environ {{hours}} h pour la payer. Repartager le lien ?",
  requestAction: "Partager le lien",
  bridgeTitle: "Votre transfert vers {{chain}} prend du temps",
  bridgeBody: "Cela fait {{minutes}} min ; il arrive d’habitude en une minute environ. Voyez où il en est.",
  bridgeAction: "Vérifier",
  healthTitle: "Votre {{side}} sur {{market}} approche de la liquidation",
  healthBody:
    "Santé {{health}} ; liquidation si le prix bouge de {{distance}} contre vous. Ajouter de la marge ou fermer une partie la garde sûre.",
  healthAction: "Examiner",
  healthPrompt: "Mon {{side}} sur {{market}} a une santé de {{health}}. Quelles sont mes options ?",
  moveTitle: "{{asset}} a bougé de {{change}} aujourd’hui",
  moveBody: "Vos {{held}} {{asset}} font {{valueChange}} en dollars ({{price}} l’unité en ce moment).",
  moveAction: "Demander pourquoi",
  movePrompt:
    "Pourquoi {{asset}} a-t-il bougé de {{change}} aujourd’hui, et qu’est-ce que cela change pour mes {{held}} {{asset}} ?",
};
