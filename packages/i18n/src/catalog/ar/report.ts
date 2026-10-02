import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "هذا الأسبوع",
  loading: "جارٍ تجميع أسبوعك…",
  in: "الوارد ({{count}})",
  out: "الصادر ({{count}})",
  swaps: "عمليات التبديل: {{count}}",
  bridges: "النقل إلى شبكات أخرى: {{count}}",
  earn: "حركات الادخار: {{count}}",
  services: "الخدمات ({{count}}): {{amount}}",
  automations: "الأتمتة: نُفّذ {{ran}}، وتُخطّي {{skipped}}",
  invoices: "الفواتير المدفوعة: {{count}} ({{amount}})",
  partial: "أمكن قراءة الجزء الأحدث فقط من هذا الأسبوع.",
};
