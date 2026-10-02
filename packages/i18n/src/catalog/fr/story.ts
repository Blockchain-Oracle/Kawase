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
  firstTitle: "Essayez en une minute.",
  firstBody:
    "Recevez des USDC de test gratuits, puis envoyez-en à un ami. Pas d'argent réel tant que vous ne l'avez pas choisi.",
  example: "Exemple",
  exampleRequest: "Envoie 10 USDC à @amina",
  fieldAmount: "Montant",
  fieldTo: "À",
  fieldNetwork: "Réseau",
  typingNow: "L'écrit marche déjà · la voix arrive",
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
  firstStep1: "Recevoir des USDC de test gratuits",
  firstStep2: "En envoyer au @handle d'un ami",
  goTo: "Aller à l'étape {{n}}",
  canvasHint: "Balayez vers le haut ou le bas pour changer d'étape",
  readAloud: "Lire à voix haute",
};
