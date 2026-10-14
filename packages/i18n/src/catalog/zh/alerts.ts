import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "{{name}} 上有新的登录",
  deviceSignedInBody: "{{platform}} · {{location}}。如果不是你本人，请在“设备”中让它退出登录，并开启“全部暂停”。",
  deviceSignedInBodyNoPlace: "{{platform}}。如果不是你本人，请在“设备”中让它退出登录，并开启“全部暂停”。",
  deviceSignedOutTitle: "{{name}} 已退出登录",
  deviceSignedOutBody: "它已无法再使用你的账户。如果这不是你做的，请立即查看“设备”。",
  kindDeviceSignedIn: "新的登录",
  kindDeviceSignedOut: "设备退出登录",
  aDevice: "一台设备",
};
