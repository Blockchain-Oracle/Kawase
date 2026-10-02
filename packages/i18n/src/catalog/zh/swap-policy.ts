import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "此网络暂不支持兑换。",
  ON_OTHER_NETWORK: "兑换可在 {{network}} 上使用。",
  PAUSED_ALL: "你已暂停所有资金操作。请在设置中恢复后继续。",
  SIGN_IN_REQUIRED: "请登录后兑换。",
  WALLET_NOT_READY: "请先设置你的钱包。",
  WALLET_NOT_SET_UP: "请先在此网络上设置你的钱包。",
  INSUFFICIENT_BALANCE: "余额不足。你有 {{balance}}。",
  INSUFFICIENT_GAS: "请留出约 {{needed}} 用于网络费。",
  AMOUNT_MISSING: "多少？",
  AMOUNT_INVALID: "金额无效。",
  ASSET_UNCLEAR: "从 USDC 还是 EURC 兑换？",
  SWAP_SAME_TOKEN: "请选择两种不同的货币。",
  SWAP_PAIR_UNSUPPORTED: "Kawase 无法在此兑换这两种货币。",
  QUOTE_UNAVAILABLE: "暂时没有价格。",
  PRICE_IMPACT_HIGH: "此价格比市场低 {{gap}}%，超过了 Kawase 允许的 {{max}}%。请尝试更小的金额或稍后再试。",
  RATE_BELOW_REFERENCE: "此价格比市场汇率低 {{gap}}%。",
  fixTryAgain: "重试",
  BRAKE_PRICE_IMPACT: "此价格比市场低 {{gap}}%，超过你设定的 {{max}}% 规则。",
};
