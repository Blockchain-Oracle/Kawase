import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "此网络暂不支持跨链。",
  ON_OTHER_NETWORK: "跨链可在 {{network}} 上使用。",
  PAUSED_ALL: "你已暂停所有资金操作。请在设置中恢复后继续。",
  SIGN_IN_REQUIRED: "请登录后跨链。",
  WALLET_NOT_READY: "请先设置你的钱包。",
  WALLET_NOT_SET_UP: "请先在此网络上设置你的钱包。",
  DESTINATION_MISSING: "转到哪条链？",
  AMOUNT_MISSING: "多少？",
  AMOUNT_INVALID: "金额无效。",
  INSUFFICIENT_BALANCE: "USDC 不足。你有 {{balance}}。",
  INSUFFICIENT_GAS: "请在 Arc 上留出约 {{needed}} 用于网络费。",
  AMOUNT_BELOW_FEE: "少于路由费（最多 {{fee}}）。请多发一些。",
  QUOTE_UNAVAILABLE: "暂时没有路由。",
};
