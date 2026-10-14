import type { Catalog } from "../en/index";

export const yieldOptions: Catalog["yieldOptions"] = {
  title: "{{asset}} 在哪里赚钱",
  best: "最佳",
  outNow: "现可取出 {{now}} · 规模 {{size}}",
  poolSize: "池子 {{size}}",
  apy: "APY",
  apr: "APR 奖励",
  risk_blue_chip: "蓝筹借贷",
  risk_curated: "精选金库",
  risk_rwa_credit: "RWA 信贷",
  risk_advanced: "进阶",
  note_low_liquidity: "目前可取出的很少",
  note_small_for_amount: "目前无法返还这个金额",
  note_advanced: "价格波动可能让你剩得更少（无常损失）",
  advanced: "进阶",
  advancedBody:
    "LP 奖励仅供参考：要获得它，需要把两种资产放在一个池子里，价格波动可能让你剩得更少。Kawase 不会存入这些池子。",
  none: "目前 Arc 上没有为 {{asset}} 支付收益的地方。",
  chooseHint: "打开存入",
  moreWays: "更多赚取方式",
  earnWith: "通过 {{name}} 赚取收益",
};
