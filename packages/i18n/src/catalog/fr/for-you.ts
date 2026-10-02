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
  healthTitle: "La santé de votre prêt baisse",
  healthBody: "Facteur de santé {{health}}. Ajouter du collatéral ou rembourser un peu le garde sûr.",
  healthAction: "Examiner",
  healthPrompt: "Le facteur de santé de mon prêt est {{health}}. Quelles sont mes options ?",
  moveTitle: "L’euro a bougé de {{change}} face au dollar",
  moveBody: "Vos {{held}} EURC font {{valueChange}} en dollars (taux BCE {{rate}} USD pour 1 EUR, {{date}}).",
  moveAction: "Demander pourquoi",
  movePrompt:
    "Pourquoi l’euro a-t-il bougé de {{change}} face au dollar, et qu’est-ce que cela change pour mes {{held}} EURC ?",
};
