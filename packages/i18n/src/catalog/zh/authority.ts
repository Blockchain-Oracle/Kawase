import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "Kawase 可以",
  never: "Kawase 永远不能",
  worst: "最坏情况",
  canSendDaily: "每天从你的钱包最多发送 {{amount}}",
  canSendPeriod: "每个周期从你的钱包最多发送 {{amount}}",
  canNoPrompt: "无需每次询问你",
  neverMore: "一天内发送超过 {{amount}}",
  neverOtherTokens: "动用任何其他代币或合约",
  neverLimits: "更改你的额度或这项授权",
  worstCase: "即使一切出错，一天内最多也只会转出 {{amount}}，而且你随时可以关闭。",
  meta: "{{network}} · 有效期至 {{date}}",
  unknownTerms: "这项授权包含 Kawase 无法识别的条款，请勿依赖此摘要。",
};
