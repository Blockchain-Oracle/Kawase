import type { Catalog } from "../en/index";

export const limits: Catalog["limits"] = {
  title: "钱包与额度",
  setUp: "已设置 · 两个网络使用同一地址",
  notSetUp: "尚未在此网络上设置",
  notSetUpBody: "请先在此网络上设置你的钱包，只需几秒钟。",
  offBody: "每日额度已关闭，因此每次发送都需要你的面容 ID。",
  offBodyWeb: "日常额度已关闭，每笔转账都需要邮箱验证码。",
  offBodyAndroid: "每日额度已关闭，因此每次发送都需要你的指纹或屏幕锁定验证。",
  turnOn: "开启每日额度",
  holdToRevoke: "按住以关闭额度",
  revoking: "正在关闭…",
  revokeNote: "关闭额度是一笔由你签名的 Arc 交易，Kawase 会立即失去授权。",
  revoked: "每日额度已关闭",
  holdHint: "按住 {{seconds}} 秒以确认。提前松开即取消。",
  revokeSigning: "正在等待你的签名…",
  revokeChecking: "正在向网络确认…",
  revokeNotSigned: "签名未完成。你的额度仍然开启。",
  revokeFailed: "操作未成功。你的额度仍然开启。",
  revokeReverted: "网络拒绝了这笔交易。你的额度仍然开启。",
  revokeUnconfirmed: "尚未确认，网络上可能仍会完成。再试一次之前，请先重新检查。",
  checkAgain: "重新检查",
};
