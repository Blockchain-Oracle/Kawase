import type { Catalog } from "../en/index";

export const limits: Catalog["limits"] = {
  title: "Carteira e limites",
  setUp: "Configurada · o mesmo endereço nas duas redes",
  notSetUp: "Ainda não configurada nesta rede",
  notSetUpBody: "Configure sua carteira nesta rede primeiro. Leva alguns segundos.",
  offBody: "O limite diário está desligado, então cada envio precisa do seu Face ID.",
  offBodyWeb: "O limite diário está desligado, então cada envio precisa de um código do seu email.",
  offBodyAndroid: "O limite diário está desligado, então cada envio precisa da sua digital ou do bloqueio de tela.",
  turnOn: "Ligar o limite diário",
  holdToRevoke: "Segure para desligar o limite",
  revoking: "Desligando…",
  revokeNote: "Desligar é uma transação na Arc que você assina. O Kawase perde a permissão na hora.",
  revoked: "Limite diário desligado",
  holdHint: "Segure por {{seconds}} segundos para confirmar. Soltar antes cancela.",
  revokeSigning: "Aguardando sua assinatura…",
  revokeChecking: "Verificando com a rede…",
  revokeNotSigned: "A assinatura não foi concluída. Seu limite continua ligado.",
  revokeFailed: "Não deu certo. Seu limite continua ligado.",
  revokeReverted: "A rede recusou. Seu limite continua ligado.",
  revokeUnconfirmed: "Ainda não confirmado. Pode concluir na rede — verifique de novo antes de tentar outra vez.",
  checkAgain: "Verificar de novo",
};
