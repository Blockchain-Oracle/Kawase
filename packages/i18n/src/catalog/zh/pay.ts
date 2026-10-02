import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "支付 {{amount}}",
  signInToPay: "登录后支付",
  otherWallet: "用其他钱包支付",
  otherWalletBody: "在 {{network}} 上向此地址准确发送 {{amount}}。到账后请求会标记为已付款。",
  ownRequest: "这是你自己的收款请求。把链接发给需要付款的人。",
  paidTitle: "已付款",
  paidBody: "此请求已付款，无需再操作。",
  canceledTitle: "请求已取消",
  canceledBody: "{{name}} 已取消此请求，无需付款。",
  expiredTitle: "请求已过期",
  expiredBody: "此链接已失效。请向 {{name}} 索要新的链接。",
  notFoundTitle: "找不到这个请求",
  notFoundBody: "请检查链接，或索要新的链接。",
  loadFailed: "无法加载此请求。",
};
