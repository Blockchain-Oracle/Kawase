import type { Catalog } from "../en/index";

export const story: Catalog["story"] = {
  haveAccount: "J'ai déjà un compte",
  panelOf: "Étape {{n}} sur {{total}}",
  requestTitle: "Dites à Kawase ce qu'il vous faut.",
  requestBody:
    "Écrivez-le comme vous le diriez. Kawase en fait un paiement exact, que vous vérifiez avant que rien ne bouge.",
  boundsTitle: "Vous fixez ce qu'il peut dépenser.",
  boundsBody:
    "Un Face ID fixe un plafond quotidien. En dessous, les envois partent sans vous demander ; au-delà, il faut votre Face ID. Désactivable à tout moment.",
  boundsBodyWeb:
    "Une confirmation fixe un plafond quotidien. En dessous, les envois partent sans demander ; au-delà, un code reçu par email est requis. Désactivable à tout moment.",
  boundsBodyAndroid:
    "Une seule approbation fixe un plafond quotidien. En dessous, les envois partent sans vous demander ; au-delà, il faut votre empreinte ou le verrouillage de l'écran. Désactivable à tout moment.",
  practiceTitle: "Entraînez-vous avec de l'argent test.",
  practiceBody:
    "Arc Testnet fonctionne comme le vrai, avec des USDC de test gratuits de Circle. L'argent réel est à un geste, et Kawase indique toujours où vous êtes.",
  languageTitle: "Dans votre langue.",
  languageBody:
    "Dix langues, lues et écrites. Changez-la avec le bouton ci-dessus — tout suit, y compris l'écriture de droite à gauche.",
  everythingTitle: "Tout sur Arc.",
  everythingBody:
    "Achetez avec Apple Pay, misez à la hausse ou à la baisse, faites fructifier ce que vous ne dépensez pas et laissez des paiements partir tout seuls, depuis un seul portefeuille.",
  everythingBuy: "Acheter avec Apple Pay",
  everythingTrade: "Miser à la hausse ou à la baisse",
  everythingEarn: "Faire fructifier l'argent qui dort",
  everythingAutomate: "Payer à date fixe",
  example: "Exemple",
  exampleRequest: "Envoie 10 USDC à @amina",
  fieldAmount: "Montant",
  fieldTo: "À",
  fieldNetwork: "Réseau",
  typingNow: "Écrivez-le ou dites-le",
  perDay: "par jour",
  boundsInside: "Les envois en dessous partent sans demander",
  boundsAbove: "Au-delà : votre Face ID",
  boundsAboveWeb: "Au-delà : un code reçu par email",
  boundsAboveAndroid: "Au-delà : votre empreinte ou le verrouillage de l'écran",
  boundsNever: "Jamais d'autres jetons, jamais vos limites",
  testMoney: "argent test",
  realMoney: "argent réel",
  faucetLine: "USDC de test gratuits de Circle",
  sameMeaning: "Même demande, même paiement",
  goTo: "Aller à l'étape {{n}}",
  canvasHint: "Balayez vers le haut ou le bas pour changer d'étape",
  readAloud: "Lire à voix haute",
  lookAround: "Jeter un œil",
  createAccount: "Créer un compte",
  swipeHint: "Balayez à gauche ou à droite pour changer d'étape",
  askTitle: "Demandez, c'est fait.",
  askBody: "Écrivez ou dites ce qu'il vous faut. Kawase s'en charge sur Arc et vous montre chaque étape.",
  askPrompt: "Ramène mes USDC de Base vers Arc",
  askRouted: "5 itinéraires vérifiés",
  askPicked: "Le meilleur choisi",
  askArrived: "Arrivé sur Arc",
  raceTitle: "Chaque itinéraire est vérifié.",
  raceBody:
    "Passerelles et plateformes d'échange se disputent votre ordre. Vous voyez chaque prix arriver, le meilleur l'emporte.",
  raceBest: "Meilleur",
  budgetTitle: "Un budget. Aucune demande.",
  budgetBody:
    "Fixez un budget hebdomadaire une fois. Dedans, Kawase agit sans demander. Tout ce qui est nouveau vous attend.",
  budgetUsed: "sur {{limit}} cette semaine",
  budgetSwaps: "Échanges et transferts",
  budgetContacts: "Contacts enregistrés",
  budgetServices: "Services d'IA",
  budgetNew: "Quelqu'un de nouveau : vous confirmez",
  arcTitle: "Tout Arc, dans une app.",
  arcBody:
    "Échangez, transférez, faites fructifier, prenez position à la hausse ou à la baisse, achetez avec Apple Pay et payez des services d'IA, sur de vraies plateformes.",
  testTitle: "Commencez avec de l'argent de test.",
  testBody:
    "Le testnet est gratuit et fonctionne comme le vrai. Passez à l'argent réel en un geste, quand vous voulez.",
};
