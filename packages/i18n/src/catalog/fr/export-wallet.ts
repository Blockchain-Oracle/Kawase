import type { Catalog } from "../en/index";

export const exportWallet: Catalog["exportWallet"] = {
  title: "Exporter le portefeuille",
  warningTitle: "Votre phrase de récupération, c'est votre portefeuille",
  warning1:
    "Quiconque possède ces mots peut prendre tout ce que contient votre portefeuille, depuis n'importe quelle app.",
  warning2: "Kawase ne vous les demandera jamais. Ne les saisissez jamais sur un site web ni dans une discussion.",
  warning3: "Notez-les sur papier et gardez-les hors ligne. Les captures d'écran sont bloquées pendant leur affichage.",
  prompt: "Afficher votre phrase de récupération",
  reveal: "Afficher la phrase de récupération",
  phrase: "Phrase de récupération",
  copy: "Copier",
  copied: "Copiée. Videz votre presse-papiers une fois qu'elle est en lieu sûr.",
  hide: "Masquer",
  failed: "L'export n'a pas fonctionné. Réessayez.",
  guestTitle: "Connectez-vous pour exporter",
  guestDetail: "La clé de votre portefeuille appartient à votre compte.",
  noWalletTitle: "Pas encore de portefeuille",
  noWalletDetail: "Configurez d'abord votre portefeuille ; sa clé pourra ensuite être exportée.",
  setUpWallet: "Configurer le portefeuille",
  keyTitle: "Clé privée",
  reconnectDetail: "La fenêtre sécurisée de Privy s'ouvre dès que ce navigateur est reconnecté à votre portefeuille.",
  holdToReveal: "Maintenez pour afficher votre clé",
  holdToRevealPhrase: "Maintenez pour afficher la phrase",
  keepHolding: "Continuez d'appuyer",
};
