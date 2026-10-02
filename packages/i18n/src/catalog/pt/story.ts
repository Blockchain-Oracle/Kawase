import type { Catalog } from "../en/index";

export const story: Catalog["story"] = {
  haveAccount: "Já tenho uma conta",
  panelOf: "Passo {{n}} de {{total}}",
  requestTitle: "Diga à Kawase do que você precisa.",
  requestBody:
    "Escreva como você falaria. A Kawase transforma isso em um pagamento exato, que você confere antes de qualquer coisa se mover.",
  boundsTitle: "Você define quanto ela pode gastar.",
  boundsBody:
    "Um Face ID define um limite diário. Dentro dele, os envios saem sem perguntar; acima disso, é preciso o seu Face ID. Desative quando quiser.",
  boundsBodyWeb:
    "Uma confirmação define um limite diário. Dentro dele, os envios saem sem perguntar; acima disso, é preciso um código do seu email. Desligue quando quiser.",
  boundsBodyAndroid:
    "Uma aprovação define um limite diário. Dentro dele, os envios saem sem perguntar; acima disso, é preciso sua digital ou o bloqueio de tela. Desative quando quiser.",
  practiceTitle: "Pratique com dinheiro de teste.",
  practiceBody:
    "A Arc Testnet funciona como a rede real, com USDC de teste grátis da Circle. O dinheiro real está a um toque, e a Kawase sempre mostra em qual você está.",
  languageTitle: "No seu idioma.",
  languageBody:
    "Dez idiomas, lidos e escritos. Troque no botão acima — tudo acompanha, inclusive a escrita da direita para a esquerda.",
  firstTitle: "Experimente em um minuto.",
  firstBody: "Pegue USDC de teste grátis e envie um pouco para um amigo. Nada de dinheiro real até você escolher.",
  example: "Exemplo",
  exampleRequest: "Envie 10 USDC para @amina",
  fieldAmount: "Valor",
  fieldTo: "Para",
  fieldNetwork: "Rede",
  typingNow: "Digitar já funciona · voz em breve",
  perDay: "por dia",
  boundsInside: "Envios dentro dele saem sem perguntar",
  boundsAbove: "Acima disso: seu Face ID",
  boundsAboveWeb: "Acima disso: um código do seu email",
  boundsAboveAndroid: "Acima disso: sua digital ou o bloqueio de tela",
  boundsNever: "Nunca outros tokens, nunca seus limites",
  testMoney: "dinheiro de teste",
  realMoney: "dinheiro real",
  faucetLine: "USDC de teste grátis da Circle",
  sameMeaning: "Mesmo pedido, mesmo pagamento",
  firstStep1: "Pegue USDC de teste grátis",
  firstStep2: "Envie um pouco para o @handle de um amigo",
  goTo: "Ir para a etapa {{n}}",
  canvasHint: "Deslize para cima ou para baixo para mudar de etapa",
  readAloud: "Ler em voz alta",
};
