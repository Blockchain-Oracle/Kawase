import type { Catalog } from "../en/index";

export const scan: Catalog["scan"] = {
  title: "Escanear para pagar",
  fanLabel: "Escanear",
  body: "Aponte para um QR de pagamento: um endereço, um link de pagamento ou um pedido da Kawase.",
  reading: "Lendo o código…",
  failed: "Não foi possível ler esse código. Tente de novo ou cole-o.",
  paste: "Colar em vez disso",
  torch: "Lanterna",
  allow: "Permitir a câmera",
  allowBody: "A Kawase usa a câmera para escanear códigos de pagamento. Você também pode colar um.",
  deniedBody: "A câmera está desativada para a Kawase. Ative-a nos Ajustes ou cole o código.",
  openSettings: "Abrir Ajustes",
  again: "Escanear de novo",
  otherNetwork: "Este código é para {{network}}. Mude de rede para pagar lá.",
  otherChain: "Este código pede pagamento na {{chain}}. A Kawase paga na Arc; peça um endereço Arc.",
  otherChainUnknown: "Este código pede pagamento em outra rede. A Kawase paga na Arc; peça um endereço Arc.",
  unsupportedAsset: "Este código pede um token que não está nesta rede.",
  requestClosed: "Este pedido já foi pago, expirou ou foi cancelado.",
  notFound: "Nenhum pedido da Kawase corresponde a este link.",
  notPayment: "Isto não é um código de pagamento.",
  chatPrompt: "Pague isto: {{code}}",
};
