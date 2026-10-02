import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "Pagar {{amount}}",
  signInToPay: "Entre para pagar",
  otherWallet: "Pagar com outra carteira",
  otherWalletBody:
    "Envie exatamente {{amount}} na {{network}} para este endereço. O pedido é marcado como pago quando chegar.",
  ownRequest: "Este é o seu próprio pedido. Compartilhe o link com quem deve pagar.",
  paidTitle: "Já pago",
  paidBody: "Este pedido já foi pago. Não há mais nada a fazer.",
  canceledTitle: "Pedido cancelado",
  canceledBody: "{{name}} cancelou este pedido. Nada a pagar.",
  expiredTitle: "Pedido expirado",
  expiredBody: "Este link não está mais aberto. Peça um novo a {{name}}.",
  notFoundTitle: "Pedido não encontrado",
  notFoundBody: "Confira o link ou peça um novo.",
  loadFailed: "Não foi possível carregar este pedido.",
};
