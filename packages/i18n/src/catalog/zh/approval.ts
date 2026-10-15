import type { Catalog } from "../en/index";

export const approval: Catalog["approval"] = {
  title: "确认是你本人",
  body: "在网页上，发送到 {{email}} 的验证码代替面容 ID。输入之前不会签署任何内容。",
  confirm: "确认",
  sending: "正在向你的邮箱发送验证码…",
  sendFailed: "验证码发送失败，请重试。",
  refused: "这与屏幕上显示的内容不一致，因此没有签署任何内容。",
};
