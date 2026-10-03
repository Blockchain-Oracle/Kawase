import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "约剩 {{n}} 次操作",
  noneLeft: "没有用于手续费的 USDC",
  explain: "Arc 上的网络费用以 USDC 支付，这是你的 USDC 还能支付多少次转账。用完后，USDC 和 EURC 转账的网络费由 Kawase 支付。",
  cardTitle: "手续费",
  perTransfer: "一次转账约 {{amount}}",
  relayer: "如果你的钱包付不起网络费，USDC 和 EURC 转账的网络费由 Kawase 支付。",
  loading: "正在查看你的手续费余量…",
};
