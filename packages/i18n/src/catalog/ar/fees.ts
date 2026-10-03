import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}} عملية متبقية",
  noneLeft: "لا USDC للرسوم",
  explain: "تُدفع رسوم الشبكة على Arc بعملة USDC، وهذا عدد الإرسالات التي يكفيها رصيدك من USDC. وعندما ينفد، تدفع Kawase الرسوم عن إرسالات USDC وEURC.",
  cardTitle: "الرسوم",
  perTransfer: "تكلفة الإرسال الواحد نحو {{amount}}",
  relayer: "إن لم تستطع محفظتك دفع الرسوم، تدفعها Kawase عن إرسالات USDC وEURC.",
  loading: "جارٍ فحص رصيد الرسوم…",
};
