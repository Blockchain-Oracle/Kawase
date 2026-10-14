import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Эта неделя",
  loading: "Собираем вашу неделю…",
  in: "Поступления ({{count}})",
  out: "Расходы ({{count}})",
  swaps: "Обмены: {{count}}",
  bridges: "Переводы в другие сети: {{count}}",
  earn: "Операции со сбережениями: {{count}}",
  services: "{{amount}} на сервисы ({{count}})",
  automations: "Автоматизации: выполнено {{ran}}, пропущено {{skipped}}",
  partial: "Удалось прочитать только последнюю часть этой недели.",
};
