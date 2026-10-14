import type { Catalog } from "../en/index";

export const report: Catalog["report"] = {
  title: "本周",
  loading: "正在汇总你的一周…",
  in: "收入（{{count}}）",
  out: "支出（{{count}}）",
  swaps: "{{count}} 次兑换",
  bridges: "{{count}} 次跨链转移",
  earn: "{{count}} 次储蓄操作",
  services: "在 {{count}} 项服务上花费 {{amount}}",
  automations: "自动化：执行 {{ran}} 次，跳过 {{skipped}} 次",
  partial: "只能读取本周最近的一部分记录。",
};
