import type { Catalog } from "../en/index";

export const exportWallet: Catalog["exportWallet"] = {
  title: "导出钱包",
  warningTitle: "助记词就是你的钱包",
  warning1: "任何人拿到这些词，都能在任何应用里转走你钱包中的全部资产。",
  warning2: "Kawase 绝不会向你索要助记词。切勿把它们输入任何网站或聊天。",
  warning3: "请手写抄下并离线保存。显示期间无法截屏。",
  prompt: "显示你的助记词",
  reveal: "显示助记词",
  phrase: "助记词",
  copy: "复制",
  copied: "已复制。保存好后请清空剪贴板。",
  hide: "隐藏",
  failed: "导出没有成功，请重试。",
};
