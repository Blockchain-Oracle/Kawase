import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "الشبكة التجريبية",
  receivedTitle: "‏وصلك {{amount}}",
  receivedBody: "‏من {{name}}",
  requestPaidTitle: "تم دفع طلبك",
  requestPaidBody: "‏{{amount}} من {{name}}",
  sentTitle: "‏أرسلت {{amount}}",
  sentBody: "‏إلى {{name}}",
  skippedTitle: "تم تخطي أتمتة",
  skippedBody: "‏لم يُرسل شيء. افتح Kawase لمعرفة السبب.",
  emailOpen: "‏افتح Kawase",
  emailNeverApprove: "‏Kawase لا يطلب منك أبداً الموافقة على أي شيء أو توقيعه عبر البريد الإلكتروني.",
  emailWhy: "‏تصلك هذه الرسالة لأنها مفعّلة في Kawase. يمكنك تغييرها من الإعدادات ← الإشعارات.",
};
