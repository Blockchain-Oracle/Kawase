import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "Entre para mover dinheiro entre redes.",
  ON_OTHER_NETWORK: "Isso funciona na outra rede.",
  NOT_AVAILABLE_YET: "Mover entre redes não está disponível agora.",
  PAUSED_ALL: "Você pausou toda movimentação de dinheiro. Retome em Ajustes para continuar.",
  WALLET_NOT_READY: "Configure sua carteira primeiro.",
  WALLET_NOT_SET_UP: "Configure sua carteira nesta rede primeiro.",
  DESTINATION_MISSING: "Qual rede?",
  RECIPIENT_INVALID: "{{query}} não é um endereço válido.",
  RECIPIENT_UNKNOWN: "Quem é {{query}}? Use um contato, um @usuário ou um endereço.",
  RECIPIENT_NO_WALLET: "@{{handle}} ainda não tem carteira Kawase.",
  RECIPIENT_AMBIGUOUS: "Mais de um contato corresponde. Qual?",
  LOOKALIKE_ADDRESS: "Parece o endereço de {{name}}, mas não é. Confira.",
  FIRST_TIME_RECIPIENT: "Primeiro pagamento para este endereço. Confira antes de enviar.",
  AMOUNT_MISSING: "Quanto?",
  AMOUNT_INVALID: "Esse valor não é válido.",
  INSUFFICIENT_BALANCE: "{{asset}} insuficiente lá. Você tem {{balance}}.",
  INSUFFICIENT_GAS: "Guarde cerca de {{needed}} para a taxa de rede.",
  QUOTE_UNAVAILABLE: "Nenhuma rota pode levar isso agora.",
  MOVE_ASSET_UNKNOWN: "A Kawase não encontra {{asset}} lá. Qual ativo você quer dizer?",
  TOKEN_BLOCKED: "{{symbol}} imita outro token, então a Kawase não vai movê-lo.",
};
