import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "‏ادفع {{amount}}",
  signInToPay: "سجّل الدخول للدفع",
  otherWallet: "الدفع من محفظة أخرى",
  otherWalletBody: "‏أرسل {{amount}} بالضبط على {{network}} إلى هذا العنوان. يُعلَّم الطلب مدفوعًا عند وصوله.",
  ownRequest: "هذا طلبك أنت. شارك الرابط مع من يجب أن يدفع.",
  paidTitle: "مدفوع بالفعل",
  paidBody: "تم دفع هذا الطلب. لا شيء آخر لفعله.",
  canceledTitle: "أُلغي الطلب",
  canceledBody: "‏ألغى {{name}} هذا الطلب. لا شيء للدفع.",
  expiredTitle: "انتهت صلاحية الطلب",
  expiredBody: "‏هذا الرابط لم يعد مفتوحًا. اطلب رابطًا جديدًا من {{name}}.",
  notFoundTitle: "الطلب غير موجود",
  notFoundBody: "تحقّق من الرابط أو اطلب رابطًا جديدًا.",
  loadFailed: "تعذّر تحميل هذا الطلب.",
};
