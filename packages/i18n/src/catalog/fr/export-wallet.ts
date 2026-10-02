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
};
