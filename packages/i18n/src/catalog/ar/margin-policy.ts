import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "سجّل الدخول للتداول.",
  ON_OTHER_NETWORK: "الشراء والبيع على المكشوف يعملان على {{network}}.",
  NOT_AVAILABLE_YET: "الشراء والبيع على المكشوف غير متاحين الآن.",
  PAUSED_ALL: "لقد أوقفت كل حركة للأموال. استأنفها من الإعدادات للمتابعة.",
  WALLET_NOT_READY: "أعدّ محفظتك أولًا.",
  WALLET_NOT_SET_UP: "أعدّ محفظتك على هذه الشبكة أولًا.",
  MARKET_MISSING: "أي سوق؟",
  SIDE_MISSING: "شراء أم بيع؟",
  MARGIN_MARKET_UNAVAILABLE:
    "لا يدرج أي سوق إقراض {{market}}، لذا لا يمكن الشراء أو البيع عليه بالرافعة هنا. اشتره أو اضبط تنبيهًا للسعر.",
  MARGIN_SIDE_UNAVAILABLE: "لا يمكن فتح {{side}} على {{market}} هنا. الشراء عليه هو شراء عادي.",
  POSITION_MISSING: "لا يوجد مركز مفتوح كهذا.",
  AMOUNT_MISSING: "كم الهامش؟",
  AMOUNT_INVALID: "هذا المبلغ غير صالح.",
  INSUFFICIENT_BALANCE: "رصيد USDC غير كافٍ. لديك {{balance}}.",
  INSUFFICIENT_GAS: "احتفظ بنحو {{needed}} لرسوم الشبكة.",
  LEVERAGE_TOO_HIGH: "يسمح هذا السوق برافعة حتى {{max}}×.",
  QUOTE_UNAVAILABLE: "لا يوجد سعر الآن.",
  MARGIN_RISK: "قد تخسر هامشك كله مع الرافعة.",
  fixTryAgain: "حاول مجددًا",
  fixSwitch: "التبديل إلى Arc",
};
