import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}} کام باقی",
  noneLeft: "فیس کے لیے USDC نہیں",
  explain: "Arc پر نیٹ ورک فیس USDC میں ادا ہوتی ہے، یعنی آپ کا USDC ابھی کتنی بار بھیجنے کی فیس دے سکتا ہے۔ ختم ہونے پر USDC اور EURC بھیجنے کی فیس Kawase دیتا ہے۔",
  cardTitle: "فیس",
  perTransfer: "ایک بار بھیجنے کا خرچ تقریباً {{amount}}",
  relayer: "اگر آپ کا والیٹ فیس ادا نہ کر سکے تو USDC اور EURC بھیجنے کی فیس Kawase دیتا ہے۔",
  loading: "آپ کا فیس ریزرو دیکھا جا رہا ہے…",
};
