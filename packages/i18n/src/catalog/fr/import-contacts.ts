import type { Catalog } from "../en/index";

export const importContacts: Catalog["importContacts"] = {
  title: "Importer des contacts",
  intro:
    "Choisissez des personnes dans les contacts de votre téléphone. Kawase les lit sur ce téléphone seulement ; rien n’est envoyé tant que vous ne cherchez pas qui est sur Kawase.",
  allow: "Autoriser l’accès aux contacts",
  denied: "Kawase ne peut pas lire vos contacts. Activez l’accès dans les Réglages pour importer.",
  phoneOnly: "L’import de contacts se fait dans l’app sur téléphone.",
  findBody: "{{count}} contacts sur ce téléphone. Chercher lesquels sont sur Kawase ?",
  find: "Chercher qui est sur Kawase",
  privacy:
    "Seules des empreintes chiffrées (hachages SHA-256) de leurs e-mails sont comparées, jamais les e-mails, noms ou numéros, et seules les personnes qui l’acceptent apparaissent.",
  onKawase: "Sur Kawase ({{count}})",
  noneOnKawase: "Aucun n’est encore sur Kawase.",
  add: "Ajouter",
  addFailed: "Impossible d’ajouter {{name}}.",
  quotaReached: "Vous avez vérifié beaucoup de contacts aujourd’hui. Réessayez demain.",
  others: "Inviter sur Kawase",
  invite: "Inviter {{name}}",
  inviteMessage:
    "Salut {{name}}, j’utilise Kawase pour envoyer et recevoir des dollars et des euros sur Arc. Rejoins-moi : {{link}}",
  done: "Terminé",
  findable: "Me laisser trouver par ceux qui ont mon e-mail",
  findableBody:
    "Quand une personne qui a votre e-mail dans ses contacts cherche, elle voit votre @pseudo. Désactivez pour ne pas apparaître.",
};
