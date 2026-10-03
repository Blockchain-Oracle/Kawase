import type { Catalog } from "../en/index";

export const errors: Catalog["errors"] = {
  offline: "Vous êtes hors ligne. Voici ce que Kawase savait en dernier.",
  serverTrouble: "Kawase est injoignable pour le moment. Voici les dernières informations connues.",
  storageUnavailable:
    "Le stockage sécurisé est indisponible. Déverrouillez votre appareil et réessayez. Votre compte n’a pas été réinitialisé.",
  offlineAction: "Pas de connexion. Vérifiez votre accès à Internet et réessayez.",
  expiredCode: "Ce code a expiré. Demandez-en un nouveau.",
  rateLimited: "Trop de codes ont été envoyés. Attendez quelques minutes, puis réessayez.",
  signInFailed: "La connexion n'a pas abouti. Réessayez.",
  walletFailed: "Vous êtes connecté, mais votre portefeuille n'a pas été créé. Réessayez : rien n'est perdu.",
  resendIn: "Nouveau code dans {{seconds}} s",
  startFailed: "Kawase n'a pas pu démarrer. Vérifiez votre connexion et réessayez.",
  walletLoadFailed: "Impossible de charger votre portefeuille.",
  scopeLoadFailed: "Impossible de préparer votre plafond quotidien.",
  scopeRefreshed: "Le plafond quotidien a été mis à jour. Relisez-le, puis approuvez.",
  notSigned: "Rien n'a été signé.",
  biometricUnavailable:
    "Activez Face ID, Touch ID, une empreinte ou un code dans les Réglages du téléphone pour approuver.",
  biometricUnavailableWeb:
    "Pour approuver sur le web, il faut l’email de votre compte. Connectez-vous avec votre email pour continuer.",
  biometricUnavailableAndroid:
    "Configurez une empreinte ou un verrouillage de l'écran dans les Paramètres du téléphone pour approuver.",
  biometricFailed: "Pas de correspondance. Rien n'a été signé. Réessayez.",
  tryAgainIn: "Réessayez dans {{time}}",
  deviceProofNeeded: "Reconnectez-vous sur ce téléphone pour l'approuver. Rien n'a été envoyé.",
};
