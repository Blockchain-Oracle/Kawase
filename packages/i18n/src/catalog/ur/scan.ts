import type { Catalog } from "../en/index";

export const scan: Catalog["scan"] = {
  title: "اسکین کر کے ادائیگی",
  fanLabel: "اسکین",
  body: "ادائیگی کے QR کی طرف کریں: پتہ، ادائیگی لنک یا Kawase درخواست۔",
  reading: "کوڈ پڑھ رہا ہے…",
  failed: "یہ کوڈ پڑھا نہیں جا سکا۔ دوبارہ کوشش کریں یا پیسٹ کریں۔",
  paste: "اس کے بجائے پیسٹ کریں",
  torch: "ٹارچ",
  allow: "کیمرے کی اجازت دیں",
  allowBody: "Kawase ادائیگی کوڈ اسکین کرنے کے لیے کیمرا استعمال کرتا ہے۔ آپ کوڈ پیسٹ بھی کر سکتے ہیں۔",
  deniedBody: "Kawase کے لیے کیمرا بند ہے۔ سیٹنگز میں آن کریں یا کوڈ پیسٹ کریں۔",
  openSettings: "سیٹنگز کھولیں",
  again: "دوبارہ اسکین کریں",
  otherNetwork: "یہ کوڈ {{network}} کے لیے ہے۔ وہاں ادائیگی کے لیے نیٹ ورک بدلیں۔",
  otherChain: "یہ کوڈ {{chain}} پر ادائیگی مانگتا ہے۔ Kawase Arc پر ادائیگی کرتا ہے؛ ان سے Arc پتہ مانگیں۔",
  otherChainUnknown: "یہ کوڈ کسی دوسری چین پر ادائیگی مانگتا ہے۔ Kawase Arc پر ادائیگی کرتا ہے؛ ان سے Arc پتہ مانگیں۔",
  unsupportedAsset: "یہ کوڈ ایسا ٹوکن مانگتا ہے جو Kawase یہاں نہیں بھیجتا۔ یہ USDC اور EURC بھیجتا ہے۔",
  requestClosed: "یہ درخواست پہلے ہی ادا، ختم یا منسوخ ہو چکی ہے۔",
  notFound: "اس لنک سے کوئی Kawase درخواست نہیں ملتی۔",
  notPayment: "یہ ادائیگی کوڈ نہیں ہے۔",
  chatPrompt: "اس کی ادائیگی کرو: {{code}}",
};
