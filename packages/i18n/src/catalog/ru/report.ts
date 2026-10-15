import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "Эта неделя",
  pnl: "Прибыль и убыток",
  loading: "Собираем вашу неделю…",
  in: "Поступления ({{count}})",
  out: "Расходы ({{count}})",
  swaps: "Обмены: {{count}}",
  bridges: "Переводы в другие сети: {{count}}",
  earn: "Операции со сбережениями: {{count}}",
  services: "{{amount}} на сервисы ({{count}})",
  automations: "Автоматизации: выполнено {{ran}}, пропущено {{skipped}}",
  partial: "Удалось прочитать только последнюю часть этой недели.",
  unread: "Историю кошелька за эту неделю сейчас не удалось прочитать. Всё, что сделал Kawase, по-прежнему здесь.",
};
