import type { Catalog } from "../en/index";

export const setup: Catalog["setup"] = {
  title: "Préparation de votre portefeuille",
  subtitle: "Sur {{network}}. Cela prend quelques secondes et Kawase paie les frais de réseau.",
  stepWallet: "Créer votre portefeuille",
  stepNetwork: "Le configurer sur {{network}}",
  settingUpDetail: "Signature et envoi via le relais de Kawase…",
  failed: "Cela n'a pas abouti. Réessayez.",
  primerTitle: "Un Face ID pour votre plafond quotidien",
  primerTitleAndroid: "Une seule approbation pour votre plafond quotidien",
  primerBody:
    "Kawase peut envoyer jusqu'à {{amount}} par jour pour vous sans demander. Au-delà, il faudra de nouveau votre Face ID, et vous pouvez le désactiver à tout moment.",
  primerBodyAndroid:
    "Kawase peut envoyer jusqu'à {{amount}} par jour pour vous sans demander. Au-delà, il faudra de nouveau votre empreinte ou le verrouillage de l'écran, et vous pouvez le désactiver à tout moment.",
  acceptFaceId: "Accepter avec Face ID",
  acceptTouchId: "Accepter avec Touch ID",
  acceptFingerprint: "Accepter avec votre empreinte",
  scopeTitle: "Ce que vous autorisez",
  scopeBody:
    "Lisez-le une fois. C'est exactement ce que vous approuvez, tiré de l'autorisation elle-même, et vous pouvez la désactiver à tout moment.",
  acceptFace: "Accepter avec le déverrouillage facial",
  acceptPasscode: "Accepter avec votre code",
  acceptEmailCode: "Accepter avec un code par email",
  faceIdPrompt: "Autoriser Kawase à envoyer jusqu'à {{amount}} par jour",
  approving: "Validation…",
  notNow: "Plus tard",
  doneTitle: "Tout est prêt",
  doneBody: "Votre portefeuille est prêt sur {{network}}. Voici exactement ce que Kawase peut en faire.",
  terms: "En continuant, vous acceptez les conditions d'utilisation de Kawase.",
  readTerms: "Lire les conditions",
  termsFailed: "Impossible d'enregistrer votre accord. Vérifiez votre connexion et réessayez.",
};
