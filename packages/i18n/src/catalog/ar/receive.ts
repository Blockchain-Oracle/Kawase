import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "استلام",
  warning: "يستقبل USDC وEURC على Arc فقط. لا يرى كاواسي الأموال المرسلة على شبكات أخرى.",
  copy: "نسخ العنوان",
  share: "مشاركة",
  network: "الشبكة",
  shareMessage: "عنواني في كاواسي على {{network}}: {{address}}",
  askAmount: "اطلب مبلغًا",
  askAsset: "الأصل",
  askShow: "اعرض الرمز",
  askHint: "أي محفظة تمسح هذا الرمز تملأ {{amount}} على {{network}}.",
  askClear: "أزل المبلغ",
  shareAsk: "أرسل لي {{amount}} على {{network}}: {{address}}\n{{uri}}",
  noWallet: "سجّل الدخول للحصول على عنوان",
  noWalletBody: "يُنشأ عنوانك مع حسابك.",
  setUpFirst: "جهّز محفظتك أولاً",
  setUpFirstBody: "خطوة واحدة، ويصبح عنوانك جاهزاً للاستلام.",
  anyToken:
    "أي رمز على Arc يصل إلى هنا. أُرسل على شبكة أخرى؟ سيصل إلى العنوان نفسه هناك: اجلبه إلى Arc من «أضف أموالًا».",
};
