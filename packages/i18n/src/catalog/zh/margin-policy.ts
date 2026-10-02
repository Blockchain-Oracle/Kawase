import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "请登录后交易。",
  ON_OTHER_NETWORK: "做多和做空在 {{network}} 上可用。",
  NOT_AVAILABLE_YET: "做多和做空暂不可用。",
  PAUSED_ALL: "你已暂停所有资金流动。请在设置中恢复后继续。",
  WALLET_NOT_READY: "请先设置钱包。",
  WALLET_NOT_SET_UP: "请先在此网络上设置钱包。",
  MARKET_MISSING: "哪个市场？",
  SIDE_MISSING: "做多还是做空？",
  MARGIN_MARKET_UNAVAILABLE: "没有借贷市场上架 {{market}}，因此这里无法对它做多或做空。可以买入，或设置价格提醒。",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} 在这里无法{{side}}。对它做多就是普通买入。",
  POSITION_MISSING: "没有这样的未平仓位。",
  AMOUNT_MISSING: "保证金多少？",
  AMOUNT_INVALID: "该金额无效。",
  INSUFFICIENT_BALANCE: "USDC 不足。你有 {{balance}}。",
  INSUFFICIENT_GAS: "请保留约 {{needed}} 作为网络费用。",
  LEVERAGE_TOO_HIGH: "该市场最高允许 {{max}}×。",
  QUOTE_UNAVAILABLE: "暂时没有报价。",
  MARGIN_RISK: "杠杆可能让你损失全部保证金。",
  fixTryAgain: "重试",
  fixSwitch: "切换到 Arc",
};
