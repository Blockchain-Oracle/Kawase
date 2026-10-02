import type { Catalog } from "../en/index";

export const network: Catalog["network"] = {
  mainnet: "Основная сеть",
  testnet: "Тестовая сеть",
  arc: "Arc",
  arcTestnet: "Arc (тест)",
  testnetStrip: "Тестовая сеть · не настоящие деньги",
  realMoney: "Настоящие деньги",
  switchTo: "Переключиться на {{network}}",
  unavailable: "{{network}} пока недоступна.",
  signInForMainnet: "Войдите, чтобы использовать настоящие деньги.",
  consentCheck: "Я понимаю, что это настоящие деньги.",
  chooseNetwork: "Выберите сеть",
};
