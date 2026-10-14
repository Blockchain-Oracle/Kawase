import type { Catalog } from "../en/index";

export const devices: Catalog["devices"] = {
  title: "Appareils",
  signedIn: "Connectés",
  thisDevice: "Cet appareil",
  lastActive: "actif {{time}}",
  signOut: "Déconnecter",
  signedOut: "{{name}} est déconnecté",
  signOutEverywhere: "Déconnecter tous les autres appareils",
  signedOutEverywhere: "Tous les autres appareils sont déconnectés",
  lostPhone:
    "Téléphone perdu ? Déconnectez-le ici, puis activez « Tout mettre en pause » dans Portefeuille et limites.",
  failed: "Impossible de charger vos appareils.",
  stillWorks: "Tout continue de fonctionner sur cet appareil.",
  loading: "Chargement de vos appareils",
  onlyThis: "Seulement cet appareil",
  onlyThisDetail: "Les téléphones et navigateurs où vous vous connectez apparaissent ici.",
  signOutEverywhereTitle: "Déconnecter tous les autres appareils ?",
  signOutThisTitle: "Vous déconnecter de cet appareil ?",
  signOutTitle: "Déconnecter {{name}} ?",
  signOutBody: "Il perd l'accès à votre compte immédiatement. Votre portefeuille et votre argent restent où ils sont.",
  signOutFailed: "La déconnexion n'a pas fonctionné. Réessayez.",
};
