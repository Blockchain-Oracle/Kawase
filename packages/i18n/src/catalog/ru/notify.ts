import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "Тестовая сеть",
  receivedTitle: "Получено {{amount}}",
  receivedBody: "От {{name}}",
  requestPaidTitle: "Ваш запрос оплачен",
  requestPaidBody: "{{amount}} от {{name}}",
  sentTitle: "Отправлено {{amount}}",
  sentBody: "Кому: {{name}}",
  skippedTitle: "Автоматизация пропущена",
  skippedBody: "Ничего не отправлено. Откройте Kawase, чтобы узнать почему.",
  emailOpen: "Открыть Kawase",
  emailNeverApprove: "Kawase никогда не просит ничего подтверждать или подписывать по почте.",
  emailWhy:
    "Вы получили это письмо, потому что это включено в Kawase. Изменить можно в разделе Настройки → Уведомления.",
};
