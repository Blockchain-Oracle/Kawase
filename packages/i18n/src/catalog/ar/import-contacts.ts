import type { Catalog } from "../en/index";

export const importContacts: Catalog["importContacts"] = {
  title: "استيراد جهات الاتصال",
  intro:
    "اختر أشخاصًا من جهات اتصال هاتفك. يقرأها Kawase على هذا الهاتف فقط؛ لا يُرسل شيء حتى تطلب معرفة من يستخدم Kawase.",
  allow: "اسمح بالوصول إلى جهات الاتصال",
  denied: "لا يستطيع Kawase قراءة جهات اتصالك. فعّل الوصول من الإعدادات للاستيراد.",
  phoneOnly: "استيراد جهات الاتصال يعمل في تطبيق الهاتف.",
  findBody: "{{count}} جهة اتصال على هذا الهاتف. هل تبحث عمّن يستخدم Kawase منهم؟",
  find: "ابحث عمّن يستخدم Kawase",
  privacy:
    "تُقارن فقط بصمات مشفّرة (تجزئات SHA-256) لبريدهم، لا البريد ولا الأسماء ولا الأرقام، ولا يظهر إلا من يسمح بالعثور عليه.",
  onKawase: "على Kawase ({{count}})",
  noneOnKawase: "لا أحد منهم على Kawase بعد.",
  add: "أضف",
  addFailed: "تعذّرت إضافة {{name}}.",
  others: "ادعُ إلى Kawase",
  invite: "ادعُ {{name}}",
  inviteMessage: "مرحبًا {{name}}، أستخدم Kawase لإرسال واستلام الدولار واليورو على Arc. انضم إليّ: {{link}}",
  done: "تم",
  findable: "دع من لديه بريدي يجدني",
  findableBody: "عندما يبحث من لديه بريدك في جهات اتصاله، يرى معرّفك @. أوقفه لتبقى غير مُدرج.",
};
