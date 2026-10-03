import type { Catalog } from "../en/index";

export const inbox: Catalog["inbox"] = {
  title: "收件箱",
  emptyTitle: "一切安好",
  emptyBody: "需要你处理的事项和 Kawase 已完成的操作会显示在这里。",
  receivedFrom: "收到来自 {{name}} 的款项",
  requestPaid: "你的收款请求已付款",
  requestPaidBy: "{{amount}}，来自 {{name}}",
  sentTo: "已发送给 {{name}}",
  unread: "新",
  markAllRead: "全部标为已读",
  loadFailed: "无法加载你的收件箱。",
  bellUnread: "收件箱，{{count}} 条新消息",
  askedYou: "{{name}} 向你请求 {{amount}}",
  remindedYou: "提醒：{{name}} 向你请求 {{amount}}",
  pay: "付款",
};
