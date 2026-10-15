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
  confirmInBrowser: "Votre portefeuille signe dans ce navigateur. Rien n'est signé tant que vous ne confirmez pas.",
  exportKeyTitle: "Votre clé privée, c'est votre portefeuille",
  exportKeyWarning1: "Toute personne qui a cette clé peut prendre tout ce que contient votre portefeuille, depuis n'importe quelle app.",
  exportKeyWarning2: "Kawase ne vous la demandera jamais. Ne la collez jamais dans un site ou une conversation.",
  exportKeyWindow: "Elle s'ouvre dans la fenêtre sécurisée de Privy. Kawase ne la voit jamais.",
  exportKeyOnWeb: "Elle s'ouvre sur le site de Kawase. Connectez-vous-y avec la même adresse e-mail, et la fenêtre sécurisée de Privy l'affichera.",
  exportKeyReveal: "Afficher la clé privée",
  exportKeyOpenWeb: "Exporter sur le site",
  oauthReturnTitle: "Finalisation de votre connexion",
  oauthReturnGoogle: "Avec votre compte Google",
  oauthReturnApple: "Avec votre compte Apple",
  creatingVerb: "Création de votre portefeuille",
  signingInVerb: "Connexion en cours",
};
