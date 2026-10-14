import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "Carteira",
  creating: "Criando sua carteira…",
  settingUp: "Configurando sua carteira na {{network}}…",
  ready: "Sua carteira está pronta",
  address: "Endereço",
  balance: "Saldo",
  noWallet: "Entre para ter uma carteira",
  setupNeeded: "Configurar na {{network}}",
  setUp: "Configurar",
  allowanceTitle: "Limite diário",
  allowanceBody:
    "A Kawase pode enviar até {{amount}} por dia por você sem perguntar. Acima disso, você aprova com Face ID.",
  allowanceBodyAndroid:
    "A Kawase pode enviar até {{amount}} por dia por você sem perguntar. Acima disso, você aprova com sua digital ou o bloqueio de tela.",
  allowanceAccept: "Aceitar",
  allowanceAcceptFaceId: "Aceitar com Face ID",
  allowanceActive: "Ativo · {{amount}} por dia",
  allowanceOff: "Desligado",
  allowanceRevoke: "Desligar",
  mainnetConsentTitle: "Dinheiro real",
  mainnetConsentBody:
    "A rede principal usa USDC real. A Kawase só o movimenta dentro dos limites que você define, e nunca acima do seu limite sem o seu Face ID.",
  mainnetConsentBodyWeb:
    "A mainnet usa USDC real. A Kawase só o movimenta dentro dos limites que você define, e nunca acima do seu limite diário sem a sua confirmação.",
  mainnetConsentBodyAndroid:
    "A rede principal usa USDC real. A Kawase só o movimenta dentro dos limites que você define, e nunca acima do seu limite sem sua digital ou o bloqueio de tela.",
  mainnetConsentAccept: "Entendi",
  testnetMoney: "O USDC de testes não tem valor.",
  confirmInBrowser: "Sua carteira assina neste navegador. Nada é assinado até você confirmar.",
  exportKeyTitle: "Sua chave privada é a sua carteira",
  exportKeyWarning1: "Qualquer pessoa com esta chave pode levar tudo o que há na sua carteira, em qualquer app.",
  exportKeyWarning2: "A Kawase nunca pede por ela. Nunca a cole em um site ou em um chat.",
  exportKeyWindow: "Ela abre na janela segura da Privy. A Kawase nunca a vê.",
  exportKeyOnWeb: "Ela abre no site da Kawase. Entre lá com o mesmo e-mail, e a janela segura da Privy a mostrará.",
  exportKeyReveal: "Mostrar chave privada",
  exportKeyOpenWeb: "Exportar no site",
};
