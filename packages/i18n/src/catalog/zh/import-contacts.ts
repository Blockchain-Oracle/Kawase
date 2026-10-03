import type { Catalog } from "../en/index";

export const importContacts: Catalog["importContacts"] = {
  title: "导入联系人",
  intro: "从手机通讯录中选人。Kawase 只在这台手机上读取；只有你要求查找谁在用 Kawase 时才会发送信息。",
  allow: "允许访问通讯录",
  denied: "Kawase 无法读取通讯录。请在设置中开启访问后再导入。",
  phoneOnly: "导入联系人需在手机应用中进行。",
  findBody: "这台手机上有 {{count}} 个联系人。要查找其中谁在用 Kawase 吗？",
  find: "查找谁在用 Kawase",
  privacy: "只比对他们邮箱的加密指纹（SHA-256 哈希），从不发送邮箱、名字或号码，且只显示允许被找到的人。",
  onKawase: "在用 Kawase（{{count}}）",
  noneOnKawase: "他们还没人在用 Kawase。",
  add: "添加",
  addFailed: "无法添加 {{name}}。",
  quotaReached: "你今天已经查过很多联系人了，明天再试吧。",
  others: "邀请加入 Kawase",
  invite: "邀请 {{name}}",
  inviteMessage: "嗨 {{name}}，我用 Kawase 在 Arc 上收付美元和欧元。一起来吧：{{link}}",
  done: "完成",
  findable: "允许有我邮箱的人找到我",
  findableBody: "通讯录里有你邮箱的人查找时，会看到你的 @账号。关闭即可不被列出。",
};
