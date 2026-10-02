import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "{{name}} 上有新的登录",
  deviceSignedInBody: "{{platform}} · {{location}}。如果不是你本人，请在“设备”中让它退出登录，并开启“全部暂停”。",
  deviceSignedInBodyNoPlace: "{{platform}}。如果不是你本人，请在“设备”中让它退出登录，并开启“全部暂停”。",
  deviceSignedOutTitle: "{{name}} 已退出登录",
  deviceSignedOutBody: "它已无法再使用你的账户。如果这不是你做的，请立即查看“设备”。",
  invoiceDueSoonTitle: "发票 {{number}} 明天到期",
  invoiceDueTodayTitle: "发票 {{number}} 今天到期",
  invoiceDueBody: "{{client}} 应付 {{amount}}。",
  invoiceOverdueTitle: "发票 {{number}} 已逾期",
  invoiceOverdueBody: "{{client}} 仍欠 {{amount}}（{{date}} 到期）。",
  kindDeviceSignedIn: "新的登录",
  kindDeviceSignedOut: "设备退出登录",
  kindInvoiceDue: "即将到期的发票",
  kindInvoiceOverdue: "逾期发票",
  aDevice: "一台设备",
};
