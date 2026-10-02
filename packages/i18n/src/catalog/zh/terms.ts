import type { Catalog } from "../en/index";

export const terms: Catalog["terms"] = {
  title: "使用条款",
  draft: "草稿",
  draftNote: "这是 Kawase 预览版的简短草稿。正式公开发布前，将由完整的条款和隐私政策取代。",
  whatTitle: "Kawase 是什么",
  whatBody: "一个服务于你自己钱包的助手，帮你在 Arc 上发送、接收并管理 USDC 和 EURC。",
  controlTitle: "Kawase 可以做什么",
  controlBody:
    "只有在你要求时，Kawase 才会转出资金。在你设定的每日额度内，它会直接发送，不再询问；超出部分需要你确认是本人。你可以随时在「钱包与额度」中修改或关闭额度。",
  riskTitle: "发送之前",
  riskBody: "区块链上的付款无法撤回，请确认收款人。Kawase 负责起草和解释，不构成理财建议。",
  testTitle: "测试币",
  testBody: "在 Arc 测试网上，测试币仅供试用 Kawase，没有实际价值。",
  dataTitle: "你的信息",
  dataBody:
    "Kawase 保存你的邮箱、用户名、联系人和对话，用于运行应用。你对助手输入或说出的内容会发送给 AI 模型来回答你。",
  version: "版本 {{version}}",
};
