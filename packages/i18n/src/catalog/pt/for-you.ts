import type { Catalog } from "../en/index";

export const forYou: Catalog["forYou"] = {
  title: "Para você",
  loading: "Procurando o que precisa da sua atenção…",
  nothing: "Nada precisa da sua atenção agora.",
  hide: "Ocultar",
  hideThis: "Ocultar isto",
  muteKind: "Não mostrar este tipo",
  showAgain: "Mostrar de novo os tipos ocultos ({{count}})",
  idleTitle: "{{amount}} USDC estão parados",
  idleBody:
    "{{vault}} paga cerca de {{apy}}% ao ano agora e pode devolver tudo na hora. {{keep}} USDC ficam prontos para gastar.",
  idleAction: "Colocar para render",
  idlePrompt: "Coloque {{amount}} USDC para render em {{vault}} e deixe {{keep}} USDC na minha carteira.",
  requestTitle: "Seu pedido de {{amount}} {{asset}} vence em breve",
  requestBody: "Faltam cerca de {{hours}} h para pagar. Compartilhar o link de novo?",
  requestAction: "Compartilhar link",
  bridgeTitle: "Sua ponte para {{chain}} está demorando",
  bridgeBody: "Já são {{minutes}} min; normalmente chega em cerca de um. Veja onde está.",
  bridgeAction: "Verificar",
  healthTitle: "Seu {{side}} em {{market}} está perto da liquidação",
  healthBody:
    "Saúde {{health}}; liquida se o preço andar {{distance}} contra você. Adicionar margem ou fechar uma parte mantém tudo seguro.",
  healthAction: "Revisar",
  healthPrompt: "Meu {{side}} em {{market}} tem saúde {{health}}. Quais são minhas opções?",
  moveTitle: "{{asset}} variou {{change}} hoje",
  moveBody: "Seus {{held}} {{asset}} estão {{valueChange}} em dólares ({{price}} cada agora).",
  moveAction: "Perguntar por quê",
  movePrompt: "Por que {{asset}} variou {{change}} hoje, e o que isso significa para meus {{held}} {{asset}}?",
};
