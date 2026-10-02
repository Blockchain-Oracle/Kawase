import type { Catalog } from "../en/index";

export const privacy: Catalog["privacy"] = {
  title: "数据与隐私",
  conversations: "对话",
  count: "{{count}} 段对话，包括聊天和语音",
  keep: "保留时长",
  keepForever: "直到我删除",
  keepDays: "{{days}} 天",
  keepBody: "更早的对话会自动删除。你的资金记录在 Arc 上，不受影响。",
  exportConversations: "导出对话",
  deleteConversations: "删除所有对话",
  deleteConfirm: "删除全部 {{count}} 段对话？此操作无法撤销。",
  delete: "删除",
  deleted: "对话已删除",
  money: "资金记录",
  moneyBody: "你的交易记录在 Arc 上，可按月导出。",
};
