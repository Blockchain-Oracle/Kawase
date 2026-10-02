import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "请登录后在链之间转移资金。",
  ON_OTHER_NETWORK: "这在另一个网络上可用。",
  NOT_AVAILABLE_YET: "跨链转移暂不可用。",
  PAUSED_ALL: "你已暂停所有资金流动。请在设置中恢复后继续。",
  WALLET_NOT_READY: "请先设置钱包。",
  WALLET_NOT_SET_UP: "请先在此网络上设置钱包。",
  DESTINATION_MISSING: "哪条链？",
  RECIPIENT_INVALID: "{{query}} 不是有效地址。",
  RECIPIENT_UNKNOWN: "{{query}} 是谁？请使用已保存的联系人、@用户名或地址。",
  RECIPIENT_NO_WALLET: "@{{handle}} 还没有 Kawase 钱包。",
  RECIPIENT_AMBIGUOUS: "匹配到多个联系人。是哪一个？",
  LOOKALIKE_ADDRESS: "这看起来像 {{name}} 的地址，但并不是。请核对。",
  FIRST_TIME_RECIPIENT: "第一次向这个地址付款。发送前请核对。",
  AMOUNT_MISSING: "多少？",
  AMOUNT_INVALID: "该金额无效。",
  INSUFFICIENT_BALANCE: "那边的 USDC 不足。你有 {{balance}}。",
  INSUFFICIENT_GAS: "请在 Arc 上保留约 {{needed}} 作为网络费用。",
  QUOTE_UNAVAILABLE: "暂时没有路径能转移它。",
};
