import type { Catalog } from "../en/index";

export const signIn: Catalog["signIn"] = {
  linkFailed: "Завершите подключение аккаунта. Повторите без нового кода.",
  accountFailed: "Вы вошли. Не удалось загрузить аккаунт. Повторите.",
  recoveryRequired:
    "Эта почта связана с существующим кошельком. Используйте прежний способ входа. Гостевой диалог сохранён.",
  title: "Вход",
  subtitle: "Один код на почту. Без паролей и PIN.",
  email: "Эл. почта",
  emailPlaceholder: "you@example.com",
  sendCode: "Прислать код",
  codeSent: "Мы отправили код на {{email}}",
  code: "Код из 6 цифр",
  verify: "Войти",
  apple: "Продолжить с Apple",
  google: "Продолжить с Google",
  or: "или",
  continueAs: "Продолжить как {{email}}",
  invalidCode: "Код не подошёл. Попробуйте ещё раз.",
  sheetTitle: "Войдите или создайте аккаунт",
  codeTitle: "Проверьте почту",
  resend: "Отправить новый код",
  signingIn: "Входим…",
  webUnavailable: "Вход через веб скоро появится. Пока используйте приложение Kawase на телефоне.",
};
