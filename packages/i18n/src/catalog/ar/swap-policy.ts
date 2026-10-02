import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "التبديل غير متاح على هذه الشبكة بعد.",
  ON_OTHER_NETWORK: "التبديل يعمل على {{network}}.",
  PAUSED_ALL: "أوقفت كل حركة للأموال مؤقتًا. استأنفها من الإعدادات للمتابعة.",
  SIGN_IN_REQUIRED: "سجّل الدخول للتبديل.",
  WALLET_NOT_READY: "جهّز محفظتك أولًا.",
  WALLET_NOT_SET_UP: "جهّز محفظتك على هذه الشبكة أولًا.",
  INSUFFICIENT_BALANCE: "المال غير كافٍ. لديك {{balance}}.",
  INSUFFICIENT_GAS: "احتفظ بنحو {{needed}} لرسوم الشبكة.",
  AMOUNT_MISSING: "كم؟",
  AMOUNT_INVALID: "هذا المبلغ غير صالح.",
  ASSET_UNCLEAR: "من USDC أم من EURC؟",
  SWAP_SAME_TOKEN: "اختر عملتين مختلفتين.",
  SWAP_PAIR_UNSUPPORTED: "لا يستطيع Kawase تبديل هاتين هنا.",
  QUOTE_UNAVAILABLE: "لا يوجد سعر الآن.",
  PRICE_IMPACT_HIGH:
    "هذا السعر أقل من السوق بـ{{gap}}%، أكثر من {{max}}% التي يسمح بها Kawase. جرّب مبلغًا أصغر أو انتظر.",
  RATE_BELOW_REFERENCE: "هذا السعر أقل من سعر السوق بـ{{gap}}%.",
  fixTryAgain: "حاول مجددًا",
  BRAKE_PRICE_IMPACT: "هذا السعر أقل من السوق بـ{{gap}}%، أكثر من قاعدتك البالغة {{max}}%.",
};
