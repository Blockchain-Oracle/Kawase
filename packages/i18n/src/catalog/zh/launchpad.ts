import type { Catalog } from "../en/index";

export const launchpad: Catalog["launchpad"] = {
  onCurve: "{{launchpad}} 曲线上：距毕业 {{percent}}%",
  graduated: "已从 {{launchpad}} 毕业",
  graduatedOn: "已于 {{date}} 转入常规池。",
  marketCap: "市值 {{amount}}",
  fees: "曲线上的交易买入付 {{buy}}%、卖出付 {{sell}}%（其中 {{creator}}% 归创建者）。",
  explainer: "毕业前，价格沿联合曲线变化：流动性薄、波动快、容易亏损。",
  watch: "毕业时提醒我",
  watching: "关注中：届时会提醒你",
};
