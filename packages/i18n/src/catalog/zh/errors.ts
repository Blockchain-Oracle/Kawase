import type { Catalog } from "../en/index";

export const errors: Catalog["errors"] = {
  offline: "你已离线。显示的是 Kawase 最后一次获取的信息。",
  serverTrouble: "暂时无法连接 Kawase。显示的是最后一次获取的信息。",
  storageUnavailable: "安全存储暂不可用。请解锁设备后重试。您的账户未被重置。",
  offlineAction: "没有网络连接。请检查网络后重试。",
  expiredCode: "验证码已过期，请重新发送。",
  rateLimited: "发送的验证码太多了。请等几分钟再试。",
  signInFailed: "登录没有成功，请重试。",
  walletFailed: "你已登录，但钱包没有创建成功。请重试，不会丢失任何内容。",
  resendIn: "{{seconds}} 秒后可重新发送",
  startFailed: "Kawase 无法启动。请检查网络后重试。",
  walletLoadFailed: "无法加载你的钱包。",
  scopeLoadFailed: "无法准备你的每日额度。",
  scopeRefreshed: "每日额度已更新。请重新阅读后再批准。",
  notSigned: "没有签署任何内容。",
  biometricUnavailable: "请在手机设置中开启面容 ID、触控 ID、指纹或密码后再批准。",
  biometricUnavailableWeb: "在网页上批准需要账户绑定的邮箱。请用邮箱登录后继续。",
  biometricUnavailableAndroid: "请在手机设置中设置指纹或屏幕锁定后再批准。",
  biometricFailed: "验证不匹配，没有签署任何内容。请重试。",
  tryAgainIn: "{{time}} 后再试",
};
