import type { Catalog } from "../en/index";

export const importContacts: Catalog["importContacts"] = {
  title: "Importar contatos",
  intro:
    "Escolha pessoas dos contatos do seu telefone. A Kawase os lê só neste telefone; nada é enviado até você pedir para encontrar quem está na Kawase.",
  allow: "Permitir acesso aos contatos",
  denied: "A Kawase não consegue ler seus contatos. Ative o acesso nos Ajustes para importar.",
  phoneOnly: "Importar contatos funciona no app do telefone.",
  findBody: "{{count}} contatos neste telefone. Encontrar quem deles está na Kawase?",
  find: "Encontrar quem está na Kawase",
  privacy:
    "Só impressões cifradas (hashes SHA-256) dos e-mails são comparadas, nunca os e-mails, nomes ou números, e só aparece quem permite ser encontrado.",
  onKawase: "Na Kawase ({{count}})",
  noneOnKawase: "Nenhum deles está na Kawase ainda.",
  add: "Adicionar",
  addFailed: "Não foi possível adicionar {{name}}.",
  quotaReached: "Você já verificou muitos contatos hoje. Tente de novo amanhã.",
  others: "Convidar para a Kawase",
  invite: "Convidar {{name}}",
  inviteMessage: "Oi {{name}}, uso a Kawase para enviar e receber dólares e euros na Arc. Vem também: {{link}}",
  done: "Pronto",
  findable: "Deixar quem tem meu e-mail me encontrar",
  findableBody: "Quando alguém com seu e-mail nos contatos procurar, verá seu @usuário. Desative para não aparecer.",
};
