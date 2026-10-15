import type { Catalog } from "../en/index";

export const approval: Catalog["approval"] = {
  title: "أكّد أنك أنت",
  body: "‏على الويب، يحلّ رمز يُرسَل إلى {{email}} محلّ بصمة الوجه. لا يُوقَّع شيء قبل أن تُدخله.",
  confirm: "تأكيد",
  sending: "جارٍ إرسال رمز إلى بريدك الإلكتروني…",
  sendFailed: "تعذّر إرسال الرمز. حاول مرة أخرى.",
  refused: "لم يطابق هذا ما يظهر على الشاشة، لذلك لم يُوقَّع أي شيء.",
};
