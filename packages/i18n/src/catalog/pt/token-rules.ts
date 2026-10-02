import type { Catalog } from "../en/index";

export const tokenRules: Catalog["tokenRules"] = {
  title: "Regras de tokens",
  row: "Quais tokens podem ser comprados, limites, impacto no preço",
  intro: "Valem para toda compra: nas telas, no chat, por voz e nas automações.",
  accessTitle: "Quais tokens",
  access_verified: "Só verificados",
  access_verifiedBody: "Só tokens que o Kawase garante",
  access_warned: "Verificados e populares, com avisos",
  access_warnedBody: "Tokens não verificados também, dentro dos limites abaixo",
  capsTitle: "Tokens não verificados",
  perTrade: "Máximo por operação",
  perDay: "Máximo por dia",
  usedToday: "{{used}} de {{cap}} usados hoje",
  capsOff: "Desligado enquanto só tokens verificados puderem ser comprados.",
  impactTitle: "Impacto no preço",
  impactBody: "Uma troca que perderia mais que isso com o impacto no preço é recusada.",
  always:
    "Cópias, tokens armadilha e tokens que não podem ser vendidos nunca são comprados, digam o que disserem estas regras.",
  save: "Salvar",
  saveLoosen: "Salvar com Face ID",
  how: "Endurecer uma regra vale na hora. Afrouxar pede Face ID, e sua carteira assina as novas regras.",
  faceId: "Afrouxar suas regras de tokens",
  notChanged: "Nada mudou.",
  saved: "Regras de tokens salvas",
  failed: "Não deu para salvar as regras. Tente de novo.",
  change: "Mudar regras de tokens",
};
