import type { Catalog } from "../en/index";

export const scan: Catalog["scan"] = {
  title: "扫码付款",
  fanLabel: "扫码",
  body: "对准付款二维码：地址、付款链接或 Kawase 收款请求。",
  reading: "正在识别…",
  failed: "无法识别该二维码。请重试，或直接粘贴。",
  paste: "改为粘贴",
  torch: "手电筒",
  allow: "允许使用相机",
  allowBody: "Kawase 用相机扫描付款二维码。你也可以直接粘贴。",
  deniedBody: "Kawase 的相机权限已关闭。请在设置中开启，或粘贴代码。",
  openSettings: "打开设置",
  again: "重新扫描",
  otherNetwork: "该二维码用于 {{network}}。切换后即可在那里付款。",
  otherChain: "该二维码要求在 {{chain}} 上付款。Kawase 在 Arc 上付款；请向对方要一个 Arc 地址。",
  otherChainUnknown: "该二维码要求在其他链上付款。Kawase 在 Arc 上付款；请向对方要一个 Arc 地址。",
  unsupportedAsset: "该二维码要求的代币 Kawase 在这里不支持发送。可发送 USDC 和 EURC。",
  requestClosed: "该请求已付款、已过期或已取消。",
  notFound: "没有与此链接匹配的 Kawase 请求。",
  notPayment: "这不是付款二维码。",
  chatPrompt: "付款：{{code}}",
};
