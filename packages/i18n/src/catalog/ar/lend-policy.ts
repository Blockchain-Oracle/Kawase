import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "سجّل الدخول لتقترض وتكسب على Aave.",
  ON_OTHER_NETWORK: "يعمل Aave V4 على {{network}}.",
  NOT_AVAILABLE_YET: "الاقتراض غير متاح الآن.",
  PAUSED_ALL: "أوقفت كل حركة للأموال مؤقتًا. استأنفها من الإعدادات للمتابعة.",
  WALLET_NOT_READY: "أعدّ محفظتك أولًا.",
  WALLET_NOT_SET_UP: "أعدّ محفظتك على هذه الشبكة أولًا.",
  ASSET_UNCLEAR: "أي أصل؟",
  LEND_ASSET_UNAVAILABLE: "لا يتيح Aave V4 ‏{{asset}} لهذا هنا.",
  LEND_NOT_COLLATERAL: "{{asset}} غير مقبول كضمان هنا. المقبول: cirBTC وWETH وUSDC.",
  LEND_NOTHING_OWED: "ليس عليك أي {{asset}}.",
  AMOUNT_MISSING: "كم؟",
  AMOUNT_INVALID: "هذا المبلغ غير صالح.",
  INSUFFICIENT_BALANCE: "لا يكفي {{asset}}. لديك {{balance}}.",
  OVER_POSITION: "لديك {{position}} في Aave.",
  INSUFFICIENT_GAS: "احتفظ بقليل من USDC لرسوم الشبكة.",
  HEALTH_TOO_LOW: "ستنخفض الصحة إلى {{health}}. تُبقيها Kawase فوق {{min}}: اقترض أقل أو ضع أكثر.",
  HEALTH_NEAR_LIMIT: "ستكون الصحة {{health}}، قريبة من الحد. هبوط بسيط في السعر قد يعرّضها للخطر.",
  fixSwitch: "انتقل إلى Arc",
};
