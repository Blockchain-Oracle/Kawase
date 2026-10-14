import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "تسجيل دخول جديد على {{name}}",
  deviceSignedInBody:
    "‏{{platform}} · {{location}}. إن لم يكن هذا أنت، فسجّل خروجه من الأجهزة وفعّل «إيقاف الكل مؤقتًا».",
  deviceSignedInBodyNoPlace: "‏{{platform}}. إن لم يكن هذا أنت، فسجّل خروجه من الأجهزة وفعّل «إيقاف الكل مؤقتًا».",
  deviceSignedOutTitle: "تم تسجيل خروج {{name}}",
  deviceSignedOutBody: "لم يعد بإمكانه استخدام حسابك. إن لم تفعل ذلك أنت، فراجع الأجهزة الآن.",
  kindDeviceSignedIn: "تسجيلات دخول جديدة",
  kindDeviceSignedOut: "أجهزة سُجّل خروجها",
  aDevice: "جهاز",
};
