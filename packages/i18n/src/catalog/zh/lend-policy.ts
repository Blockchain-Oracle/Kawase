import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "登录后即可在 Aave 借款和赚取收益。",
  ON_OTHER_NETWORK: "Aave V4 在 {{network}} 上运行。",
  NOT_AVAILABLE_YET: "暂时无法借款。",
  PAUSED_ALL: "你已暂停所有资金变动。在设置中恢复即可继续。",
  WALLET_NOT_READY: "请先设置钱包。",
  WALLET_NOT_SET_UP: "请先在此网络上设置钱包。",
  ASSET_UNCLEAR: "哪种资产？",
  LEND_ASSET_UNAVAILABLE: "Aave V4 在这里不提供 {{asset}} 的此项操作。",
  LEND_NOT_COLLATERAL: "{{asset}} 在这里不能作抵押。可用的是 cirBTC、WETH 和 USDC。",
  LEND_NOTHING_OWED: "你没有 {{asset}} 欠款。",
  AMOUNT_MISSING: "多少？",
  AMOUNT_INVALID: "金额无效。",
  INSUFFICIENT_BALANCE: "{{asset}} 不足。你有 {{balance}}。",
  OVER_POSITION: "你在 Aave 中有 {{position}}。",
  INSUFFICIENT_GAS: "请留一点 USDC 支付网络费。",
  HEALTH_TOO_LOW: "这会让健康度降到 {{health}}。Kawase 会保持在 {{min}} 以上：少借一些或多存一些。",
  HEALTH_NEAR_LIMIT: "健康度将为 {{health}}，接近下限。价格小幅下跌就可能带来风险。",
  fixSwitch: "切换到 Arc",
};
