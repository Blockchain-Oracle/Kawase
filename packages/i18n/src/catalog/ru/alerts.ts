import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "Новый вход: {{name}}",
  deviceSignedInBody:
    "{{platform}} · {{location}}. Если это были не вы, завершите его сеанс в разделе «Устройства» и включите «Приостановить всё».",
  deviceSignedInBodyNoPlace:
    "{{platform}}. Если это были не вы, завершите его сеанс в разделе «Устройства» и включите «Приостановить всё».",
  deviceSignedOutTitle: "Сеанс завершён: {{name}}",
  deviceSignedOutBody:
    "Это устройство больше не может пользоваться вашим аккаунтом. Если это сделали не вы, сразу проверьте раздел «Устройства».",
  kindDeviceSignedIn: "Новые входы",
  kindDeviceSignedOut: "Завершённые сеансы",
  aDevice: "устройство",
};
