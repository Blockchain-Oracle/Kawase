import type { Catalog } from "../en/index";

export const setup: Catalog["setup"] = {
  title: "جارٍ إعداد محفظتك",
  subtitle: "على {{network}}. يستغرق ذلك بضع ثوانٍ، و Kawase يدفع رسوم الشبكة.",
  stepWallet: "أنشئ محفظتك",
  stepNetwork: "جهّزها على {{network}}",
  settingUpDetail: "جارٍ التوقيع والإرسال عبر مُرحِّل Kawase…",
  failed: "لم تكتمل العملية. حاول مرة أخرى.",
  primerTitle: "بصمة وجه واحدة لحدّك اليومي",
  primerTitleAndroid: "موافقة واحدة لحدّك اليومي",
  primerBody:
    "يستطيع Kawase أن يرسل عنك حتى {{amount}} يوميًا دون أن يسألك. ما يزيد على ذلك يحتاج بصمة وجهك من جديد، ويمكنك إيقافه في أي وقت.",
  primerBodyAndroid:
    "يستطيع Kawase أن يرسل عنك حتى {{amount}} يوميًا دون أن يسألك. ما يزيد على ذلك يحتاج بصمة إصبعك أو قفل الشاشة من جديد، ويمكنك إيقافه في أي وقت.",
  acceptFaceId: "اقبل ببصمة الوجه",
  acceptTouchId: "اقبل ببصمة الإصبع",
  acceptFingerprint: "اقبل ببصمة إصبعك",
  scopeTitle: "ما الذي تسمح به",
  scopeBody: "اقرأ هذا مرة واحدة. هذا بالضبط ما توافق عليه، مأخوذ من الإذن نفسه، ويمكنك إيقافه في أي وقت.",
  acceptFace: "اقبل بفتح القفل بالوجه",
  acceptPasscode: "اقبل برمز المرور",
  acceptEmailCode: "قبول برمز عبر البريد",
  faceIdPrompt: "اسمح لـ Kawase بإرسال حتى {{amount}} يوميًا",
  approving: "جارٍ الاعتماد…",
  notNow: "ليس الآن",
  doneTitle: "كل شيء جاهز",
  doneBody: "محفظتك جاهزة على {{network}}. إليك بالضبط ما يستطيع Kawase فعله بها.",
  terms: "بالمتابعة، أنت توافق على شروط استخدام Kawase.",
  readTerms: "اقرأ الشروط",
  termsFailed: "تعذّر حفظ موافقتك. تحقّق من اتصالك وحاول مرة أخرى.",
};
