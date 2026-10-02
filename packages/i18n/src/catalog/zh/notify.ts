import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "测试网",
  receivedTitle: "收到 {{amount}}",
  receivedBody: "来自 {{name}}",
  requestPaidTitle: "你的收款请求已付款",
  requestPaidBody: "{{amount}}，来自 {{name}}",
  sentTitle: "已发送 {{amount}}",
  sentBody: "发给 {{name}}",
  skippedTitle: "一项自动化已跳过",
  skippedBody: "没有发送任何款项。打开 Kawase 查看原因。",
  emailOpen: "打开 Kawase",
  emailNeverApprove: "Kawase 绝不会通过邮件让你批准或签署任何内容。",
  emailWhy: "你收到这封邮件，是因为你在 Kawase 中开启了它。可在“设置 → 通知”中更改。",
};
