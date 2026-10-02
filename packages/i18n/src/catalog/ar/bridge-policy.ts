import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "الجسر غير متاح على هذه الشبكة بعد.",
  ON_OTHER_NETWORK: "الجسر يعمل على {{network}}.",
  PAUSED_ALL: "أوقفت كل حركة للأموال مؤقتًا. استأنفها من الإعدادات للمتابعة.",
  SIGN_IN_REQUIRED: "سجّل الدخول لاستخدام الجسر.",
  WALLET_NOT_READY: "جهّز محفظتك أولًا.",
  WALLET_NOT_SET_UP: "جهّز محفظتك على هذه الشبكة أولًا.",
  DESTINATION_MISSING: "إلى أي سلسلة؟",
  AMOUNT_MISSING: "كم؟",
  AMOUNT_INVALID: "هذا المبلغ غير صالح.",
  INSUFFICIENT_BALANCE: "لا تكفي عملات USDC. لديك {{balance}}.",
  INSUFFICIENT_GAS: "احتفظ بنحو {{needed}} على Arc لرسوم الشبكة.",
  AMOUNT_BELOW_FEE: "هذا أقل من رسوم المسار البالغة حتى {{fee}}. أرسل أكثر.",
  QUOTE_UNAVAILABLE: "لا يوجد مسار الآن.",
};
