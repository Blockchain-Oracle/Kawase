export const importContacts = {
  title: "Import contacts",
  intro:
    "Pick people from your phone's contacts. Kawase reads them on this phone only; nothing is sent until you ask to find who's on Kawase.",
  allow: "Allow access to contacts",
  denied: "Kawase can't read your contacts. Turn access on in Settings to import.",
  phoneOnly: "Importing contacts works in the phone app.",
  findBody: "{{count}} contacts on this phone. Find who of them is on Kawase?",
  find: "Find who's on Kawase",
  privacy:
    "Only scrambled fingerprints (SHA-256 hashes) of their emails are checked, never the emails, names or numbers, and only people who let others find them show up.",
  onKawase: "On Kawase ({{count}})",
  noneOnKawase: "None of them are on Kawase yet.",
  add: "Add",
  addFailed: "Couldn't add {{name}}.",
  quotaReached: "You've checked a lot of contacts today. Try again tomorrow.",
  others: "Invite to Kawase",
  invite: "Invite {{name}}",
  inviteMessage: "Hi {{name}}, I use Kawase to send and receive dollars and euros on Arc. Join me: {{link}}",
  done: "Done",
  findable: "Let people who have my email find me",
  findableBody:
    "When someone with your email in their contacts checks, they see your @handle. Turn it off to stay unlisted.",
};
