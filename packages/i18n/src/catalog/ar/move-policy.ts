import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "سجّل الدخول لنقل الأموال بين الشبكات.",
  ON_OTHER_NETWORK: "يعمل هذا على الشبكة الأخرى.",
  NOT_AVAILABLE_YET: "النقل بين الشبكات غير متاح الآن.",
  PAUSED_ALL: "لقد أوقفت كل حركة للأموال. استأنفها من الإعدادات للمتابعة.",
  WALLET_NOT_READY: "أعدّ محفظتك أولًا.",
  WALLET_NOT_SET_UP: "أعدّ محفظتك على هذه الشبكة أولًا.",
  DESTINATION_MISSING: "أي شبكة؟",
  RECIPIENT_INVALID: "{{query}} ليس عنوانًا صالحًا.",
  RECIPIENT_UNKNOWN: "من هو {{query}}؟ استخدم جهة اتصال أو @معرّفًا أو عنوانًا.",
  RECIPIENT_NO_WALLET: "لا يملك @{{handle}} محفظة Kawase بعد.",
  RECIPIENT_AMBIGUOUS: "تطابق أكثر من جهة اتصال. أيّها؟",
  LOOKALIKE_ADDRESS: "يشبه عنوان {{name}} لكنه ليس هو. تحقّق منه.",
  FIRST_TIME_RECIPIENT: "أول دفعة إلى هذا العنوان. تحقّق منه قبل الإرسال.",
  AMOUNT_MISSING: "كم؟",
  AMOUNT_INVALID: "هذا المبلغ غير صالح.",
  INSUFFICIENT_BALANCE: "رصيد USDC هناك غير كافٍ. لديك {{balance}}.",
  INSUFFICIENT_GAS: "احتفظ بنحو {{needed}} على Arc لرسوم الشبكة.",
  QUOTE_UNAVAILABLE: "لا يوجد مسار يمكنه نقله الآن.",
};
