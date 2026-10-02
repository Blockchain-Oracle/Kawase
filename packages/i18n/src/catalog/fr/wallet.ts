import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "Portefeuille",
  creating: "Création de votre portefeuille…",
  settingUp: "Configuration de votre portefeuille sur {{network}}…",
  ready: "Votre portefeuille est prêt",
  address: "Adresse",
  balance: "Solde",
  noWallet: "Connectez-vous pour obtenir un portefeuille",
  setupNeeded: "Configurer sur {{network}}",
  setUp: "Configurer",
  allowanceTitle: "Plafond quotidien",
  allowanceBody:
    "Kawase peut envoyer jusqu'à {{amount}} par jour pour vous sans demander. Au-delà, vous approuvez avec Face ID.",
  allowanceBodyAndroid:
    "Kawase peut envoyer jusqu'à {{amount}} par jour pour vous sans demander. Au-delà, vous approuvez avec votre empreinte ou le verrouillage de l'écran.",
  allowanceAccept: "Accepter",
  allowanceAcceptFaceId: "Accepter avec Face ID",
  allowanceActive: "Actif · {{amount}} par jour",
  allowanceOff: "Désactivé",
  allowanceRevoke: "Désactiver",
  mainnetConsentTitle: "Argent réel",
  mainnetConsentBody:
    "Le réseau principal utilise de vrais USDC. Kawase ne les déplace que dans les limites que vous fixez, et jamais au-delà de votre plafond sans votre Face ID.",
  mainnetConsentBodyWeb:
    "Le mainnet utilise de vrais USDC. Kawase ne les déplace que dans les limites que vous fixez, et jamais au-delà de votre plafond sans votre confirmation.",
  mainnetConsentBodyAndroid:
    "Le réseau principal utilise de vrais USDC. Kawase ne les déplace que dans les limites que vous fixez, et jamais au-delà de votre plafond sans votre empreinte ou le verrouillage de l'écran.",
  mainnetConsentAccept: "J'ai compris",
  testnetMoney: "Les USDC de test n'ont aucune valeur.",
};
