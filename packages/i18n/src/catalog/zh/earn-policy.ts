import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "此网络暂不支持赚取收益。",
  ON_OTHER_NETWORK: "赚取收益可在 {{network}} 上使用。",
  PAUSED_ALL: "你已暂停所有资金操作。请在设置中恢复后继续。",
  SIGN_IN_REQUIRED: "请登录后赚取收益。",
  WALLET_NOT_READY: "请先设置你的钱包。",
  WALLET_NOT_SET_UP: "请先在此网络上设置你的钱包。",
  VAULT_UNAVAILABLE: "此金库在这里不可用。",
  AMOUNT_MISSING: "多少？",
  AMOUNT_INVALID: "金额无效。",
  INSUFFICIENT_BALANCE: "USDC 不足。你有 {{balance}}。",
  INSUFFICIENT_GAS: "请留出约 {{needed}} 用于网络费。",
  OVER_POSITION: "超过了你在此金库的持仓（{{position}}）。",
  VAULT_LIQUIDITY_SHORT: "金库现在只能支付 {{available}}，其余已借出。请减少金额或稍后再试。",
  VAULT_LOW_LIQUIDITY: "流动性低：取款可能需要等待",
  VAULT_RISK_WARNING: "App Kit 标记了此金库：{{warnings}}",
  VAULT_LIQUIDITY_STUCK: "该金库目前只能支付 {{available}}，因此 Kawase 不会存入。请选择流动性充足的金库。",
};
