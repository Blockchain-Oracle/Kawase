import type { Catalog } from "../en/index";

export const receipt: Catalog["receipt"] = {
  title: "收据",
  sent: "你已发送",
  received: "你已收到",
  to: "收款人",
  from: "付款人",
  when: "时间",
  network: "网络",
  note: "备注",
  transaction: "交易",
  testMoney: "测试币",
  footer: "通过 Kawase 在 Arc 上支付 · getkawase.xyz",
  share: "分享收据",
  shareImage: "分享图片",
  sentLine: "我用 Kawase 向 {{name}} 发送了 {{amount}}。",
  receivedLine: "我用 Kawase 收到了 {{name}} 的 {{amount}}。",
  saveSender: "把付款人存为联系人",
  savedAs: "已存为 {{name}}。",
};
