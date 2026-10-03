import type { Catalog } from "../en/index";

export const scan: Catalog["scan"] = {
  title: "امسح للدفع",
  fanLabel: "مسح",
  body: "وجّه الكاميرا إلى رمز دفع: عنوان أو رابط دفع أو طلب من Kawase.",
  reading: "جارٍ قراءة الرمز…",
  failed: "تعذّرت قراءة الرمز. حاول مجددًا أو الصقه.",
  paste: "الصق بدلًا من ذلك",
  torch: "الكشاف",
  allow: "اسمح بالكاميرا",
  allowBody: "يستخدم Kawase الكاميرا لمسح رموز الدفع. يمكنك أيضًا لصق رمز.",
  deniedBody: "الكاميرا متوقفة لـ Kawase. فعّلها من الإعدادات أو الصق الرمز.",
  openSettings: "افتح الإعدادات",
  again: "امسح مجددًا",
  otherNetwork: "هذا الرمز لشبكة {{network}}. بدّل الشبكة للدفع هناك.",
  otherChain: "هذا الرمز يطلب الدفع على {{chain}}. يدفع Kawase على Arc؛ اطلب منهم عنوانًا على Arc.",
  otherChainUnknown: "هذا الرمز يطلب الدفع على سلسلة أخرى. يدفع Kawase على Arc؛ اطلب منهم عنوانًا على Arc.",
  unsupportedAsset: "هذا الرمز يطلب رمزًا غير موجود على هذه الشبكة.",
  requestClosed: "هذا الطلب مدفوع أو منتهٍ أو ملغى بالفعل.",
  notFound: "لا يوجد طلب من Kawase يطابق هذا الرابط.",
  notPayment: "هذا ليس رمز دفع.",
  chatPrompt: "ادفع هذا: {{code}}",
};
