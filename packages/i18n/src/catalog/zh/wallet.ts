import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "钱包",
  creating: "正在创建你的钱包…",
  settingUp: "正在{{network}}上设置你的钱包…",
  ready: "钱包已就绪",
  address: "地址",
  balance: "余额",
  noWallet: "登录以获取钱包",
  setupNeeded: "在{{network}}上设置",
  setUp: "设置",
  allowanceTitle: "每日额度",
  allowanceBody: "Kawase 每天最多可为你发送 {{amount}}，无需询问。超过额度时，你用面容 ID 批准。",
  allowanceBodyAndroid: "Kawase 每天最多可为你发送 {{amount}}，无需询问。超过额度时，你用指纹或屏幕锁定批准。",
  allowanceAccept: "接受",
  allowanceAcceptFaceId: "用面容 ID 接受",
  allowanceActive: "已开启 · 每天 {{amount}}",
  allowanceOff: "已关闭",
  allowanceRevoke: "关闭",
  mainnetConsentTitle: "真实资金",
  mainnetConsentBody: "主网使用真实的 USDC。Kawase 只在你设定的限额内操作，未经你的面容 ID 绝不超出额度。",
  mainnetConsentBodyWeb: "主网使用真实的 USDC。Kawase 只会在你设定的限额内转账，未经你确认绝不会超出额度。",
  mainnetConsentBodyAndroid:
    "主网使用真实的 USDC。Kawase 只在你设定的限额内操作，未经你的指纹或屏幕锁定验证绝不超出额度。",
  mainnetConsentAccept: "我明白",
  testnetMoney: "测试网 USDC 没有价值。",
};
