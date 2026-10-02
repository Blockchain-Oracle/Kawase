import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "اس نیٹ ورک پر برج ابھی دستیاب نہیں۔",
  ON_OTHER_NETWORK: "برج {{network}} پر کام کرتا ہے۔",
  PAUSED_ALL: "آپ نے رقم کی تمام نقل و حرکت روک دی ہے۔ جاری رکھنے کے لیے سیٹنگز میں دوبارہ شروع کریں۔",
  SIGN_IN_REQUIRED: "برج کے لیے سائن ان کریں۔",
  WALLET_NOT_READY: "پہلے اپنا والٹ سیٹ اپ کریں۔",
  WALLET_NOT_SET_UP: "پہلے اس نیٹ ورک پر اپنا والٹ سیٹ اپ کریں۔",
  DESTINATION_MISSING: "کس چین پر؟",
  AMOUNT_MISSING: "کتنا؟",
  AMOUNT_INVALID: "یہ رقم درست نہیں۔",
  INSUFFICIENT_BALANCE: "‏USDC کافی نہیں۔ آپ کے پاس {{balance}} ہے۔",
  INSUFFICIENT_GAS: "نیٹ ورک فیس کے لیے Arc پر تقریباً {{needed}} رکھیں۔",
  AMOUNT_BELOW_FEE: "یہ روٹ فیس ({{fee}} تک) سے کم ہے۔ زیادہ بھیجیں۔",
  QUOTE_UNAVAILABLE: "ابھی کوئی روٹ نہیں۔",
};
