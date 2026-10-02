import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "Rede de testes",
  receivedTitle: "Você recebeu {{amount}}",
  receivedBody: "De {{name}}",
  requestPaidTitle: "Seu pedido foi pago",
  requestPaidBody: "{{amount}} de {{name}}",
  sentTitle: "Você enviou {{amount}}",
  sentBody: "Para {{name}}",
  skippedTitle: "Uma automação foi pulada",
  skippedBody: "Nada foi enviado. Abra o Kawase para ver por quê.",
  emailOpen: "Abrir o Kawase",
  emailNeverApprove: "O Kawase nunca pede que você aprove ou assine nada por email.",
  emailWhy: "Você recebe isto porque está ativado no Kawase. Altere em Configurações → Notificações.",
};
