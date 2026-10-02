import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "الكسب غير متاح على هذه الشبكة بعد.",
  ON_OTHER_NETWORK: "الكسب يعمل على {{network}}.",
  PAUSED_ALL: "أوقفت كل حركة للأموال مؤقتًا. استأنفها من الإعدادات للمتابعة.",
  SIGN_IN_REQUIRED: "سجّل الدخول لتكسب.",
  WALLET_NOT_READY: "جهّز محفظتك أولًا.",
  WALLET_NOT_SET_UP: "جهّز محفظتك على هذه الشبكة أولًا.",
  VAULT_UNAVAILABLE: "هذه الخزنة غير متاحة هنا.",
  AMOUNT_MISSING: "كم؟",
  AMOUNT_INVALID: "هذا المبلغ غير صالح.",
  INSUFFICIENT_BALANCE: "لا تكفي عملات USDC. لديك {{balance}}.",
  INSUFFICIENT_GAS: "احتفظ بنحو {{needed}} لرسوم الشبكة.",
  OVER_POSITION: "هذا أكثر مما لديك في هذه الخزنة ({{position}}).",
  VAULT_LIQUIDITY_SHORT: "لا تستطيع الخزنة دفع أكثر من {{available}} الآن؛ الباقي مُقرَض. جرّب أقل أو لاحقًا.",
  VAULT_LOW_LIQUIDITY: "سيولة منخفضة: قد يتأخر السحب",
  VAULT_RISK_WARNING: "يشير App Kit إلى هذه الخزنة: {{warnings}}",
};
