import type { Catalog } from "../en/index";

export const signIn: Catalog["signIn"] = {
  linkFailed: "Conclua a conexão da conta. Tente novamente sem um novo código.",
  accountFailed: "Você entrou. Não foi possível carregar sua conta. Tente novamente.",
  recoveryRequired:
    "Este e-mail pertence a uma carteira existente. Use o método de acesso original. Sua conversa como visitante foi mantida.",
  title: "Entrar",
  subtitle: "Um código por e-mail. Sem senhas, sem PIN.",
  email: "E-mail",
  emailPlaceholder: "voce@exemplo.com",
  sendCode: "Enviar um código",
  codeSent: "Enviamos um código para {{email}}",
  code: "Código de 6 dígitos",
  verify: "Entrar",
  apple: "Continuar com a Apple",
  google: "Continuar com o Google",
  or: "ou",
  continueAs: "Continuar como {{email}}",
  invalidCode: "Esse código não funcionou. Tente de novo.",
  sheetTitle: "Entre ou crie uma conta",
  codeTitle: "Confira seu e-mail",
  resend: "Enviar um novo código",
  signingIn: "Entrando…",
  webUnavailable: "Em breve será possível entrar pela web. Por enquanto, use o app Kawase no seu celular.",
};
