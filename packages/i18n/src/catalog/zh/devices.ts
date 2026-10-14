import type { Catalog } from "../en/index";

export const devices: Catalog["devices"] = {
  title: "设备",
  signedIn: "已登录",
  thisDevice: "本设备",
  lastActive: "最近活跃：{{time}}",
  signOut: "退出登录",
  signedOut: "{{name}} 已退出登录",
  signOutEverywhere: "退出其他所有设备",
  signedOutEverywhere: "其他所有设备均已退出登录",
  lostPhone: "手机丢了？先在这里让它退出登录，再到“钱包与额度”中开启“全部暂停”。",
  failed: "无法加载你的设备。",
  stillWorks: "此设备上的一切照常运行。",
  loading: "正在加载你的设备",
  onlyThis: "只有此设备",
  onlyThisDetail: "你登录过的手机和浏览器会显示在这里。",
  signOutEverywhereTitle: "退出所有其他设备？",
  signOutThisTitle: "退出此设备？",
  signOutTitle: "退出 {{name}}？",
  signOutBody: "它会立即停止使用你的账户。你的钱包和资金保持不变。",
  signOutFailed: "退出失败，请重试。",
};
