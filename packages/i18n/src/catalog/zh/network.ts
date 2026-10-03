import type { Catalog } from "../en/index";

export const network: Catalog["network"] = {
  mainnet: "主网",
  testnet: "测试网",
  arc: "Arc",
  arcTestnet: "Arc 测试网",
  testnetStrip: "测试网 · 不是真实资金",
  realMoney: "真实资金",
  switchTo: "切换到{{network}}",
  unavailable: "{{network}}暂不可用。",
  signInForMainnet: "登录后才能使用真实资金。",
  consentCheck: "我明白这是真实资金。",
  chooseNetwork: "选择网络",
  sheetTitle: "网络",
  testMoney: "测试资金，没有价值",
  notYet: "暂不可用",
  totalAt: "截至 {{time}}",
  sheetDrafts: "你正在核对的内容会留在创建它的网络上。切换回去即可批准。",
};
