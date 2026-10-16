import type { Catalog } from "../en/index";

export const update: Catalog["update"] = {
  title: "需要更新",
  body: "此版本（{{version}}）已不再受支持。请更新 Kawase 后继续使用；你的资金是安全的。",
  action: "更新",
  readyTitle: "Kawase 已更新",
  readyRestart: "重启",
  readyReload: "刷新",
};
