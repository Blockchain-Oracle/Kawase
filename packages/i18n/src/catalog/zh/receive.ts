import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "收款",
  warning: "仅支持 Arc 上的 USDC 和 EURC。其他网络上的资金 Kawase 无法看到。",
  copy: "复制地址",
  share: "分享",
  network: "网络",
  shareMessage: "我在 {{network}} 上的 Kawase 地址：{{address}}",
  noWallet: "登录后获取地址",
  noWalletBody: "地址会随账户一起创建。",
  setUpFirst: "请先设置钱包",
  setUpFirstBody: "只需一步，你的地址即可收款。",
};
