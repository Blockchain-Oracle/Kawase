import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "المحفظة",
  creating: "جارٍ إنشاء محفظتك…",
  settingUp: "جارٍ إعداد محفظتك على {{network}}…",
  ready: "محفظتك جاهزة",
  address: "العنوان",
  balance: "الرصيد",
  noWallet: "سجّل الدخول للحصول على محفظة",
  setupNeeded: "الإعداد على {{network}}",
  setUp: "إعداد",
  allowanceTitle: "الحد اليومي",
  allowanceBody: "يمكن لكاواسي أن يرسل نيابةً عنك حتى {{amount}} يومياً دون أن يسأل. فوق ذلك، توافق ببصمة الوجه.",
  allowanceBodyAndroid:
    "يمكن لكاواسي أن يرسل نيابةً عنك حتى {{amount}} يومياً دون أن يسأل. فوق ذلك، توافق ببصمة إصبعك أو قفل الشاشة.",
  allowanceAccept: "موافقة",
  allowanceAcceptFaceId: "الموافقة ببصمة الوجه",
  allowanceActive: "مفعّل · {{amount}} يومياً",
  allowanceOff: "متوقف",
  allowanceRevoke: "إيقاف",
  mainnetConsentTitle: "أموال حقيقية",
  mainnetConsentBody:
    "تستخدم الشبكة الرئيسية USDC حقيقية. لا يحرّكها كاواسي إلا ضمن الحدود التي تضعها، ولا يتجاوز حدّك أبداً دون بصمة وجهك.",
  mainnetConsentBodyWeb:
    "‏الشبكة الرئيسية تستخدم USDC حقيقية. لا ينقلها Kawase إلا ضمن الحدود التي تضعها، ولا يتجاوز حدّك أبدًا دون تأكيدك.",
  mainnetConsentBodyAndroid:
    "تستخدم الشبكة الرئيسية USDC حقيقية. لا يحرّكها كاواسي إلا ضمن الحدود التي تضعها، ولا يتجاوز حدّك أبداً دون بصمة إصبعك أو قفل الشاشة.",
  mainnetConsentAccept: "فهمت",
  testnetMoney: "‏USDC التجريبية لا قيمة لها.",
  confirmInBrowser: "محفظتك توقّع في هذا المتصفح. لا يُوقَّع شيء حتى تؤكّد.",
  exportKeyTitle: "مفتاحك الخاص هو محفظتك",
  exportKeyWarning1: "أي شخص يملك هذا المفتاح يستطيع أخذ كل ما في محفظتك، من أي تطبيق.",
  exportKeyWarning2: "كاواسي لا يطلبه أبداً. لا تلصقه أبداً في موقع أو محادثة.",
  exportKeyWindow: "يُفتح في نافذة Privy الآمنة. كاواسي لا يراه أبداً.",
  exportKeyOnWeb: "يُفتح على موقع كاواسي. سجّل الدخول هناك بالبريد نفسه، وستعرضه نافذة Privy الآمنة.",
  exportKeyReveal: "إظهار المفتاح الخاص",
  exportKeyOpenWeb: "التصدير على الموقع",
};
