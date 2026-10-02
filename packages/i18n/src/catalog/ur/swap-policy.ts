import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "اس نیٹ ورک پر تبادلہ ابھی دستیاب نہیں۔",
  ON_OTHER_NETWORK: "تبادلہ {{network}} پر کام کرتا ہے۔",
  PAUSED_ALL: "آپ نے رقم کی تمام نقل و حرکت روک دی ہے۔ جاری رکھنے کے لیے سیٹنگز میں دوبارہ شروع کریں۔",
  SIGN_IN_REQUIRED: "تبادلے کے لیے سائن ان کریں۔",
  WALLET_NOT_READY: "پہلے اپنا والٹ سیٹ اپ کریں۔",
  WALLET_NOT_SET_UP: "پہلے اس نیٹ ورک پر اپنا والٹ سیٹ اپ کریں۔",
  INSUFFICIENT_BALANCE: "رقم کافی نہیں۔ آپ کے پاس {{balance}} ہے۔",
  INSUFFICIENT_GAS: "نیٹ ورک فیس کے لیے تقریباً {{needed}} رکھیں۔",
  AMOUNT_MISSING: "کتنا؟",
  AMOUNT_INVALID: "یہ رقم درست نہیں۔",
  ASSET_UNCLEAR: "‏USDC سے یا EURC سے؟",
  SWAP_SAME_TOKEN: "دو مختلف کرنسیاں چنیں۔",
  SWAP_PAIR_UNSUPPORTED: "‏Kawase یہاں ان کا تبادلہ نہیں کر سکتا۔",
  QUOTE_UNAVAILABLE: "ابھی کوئی قیمت نہیں۔",
  PRICE_IMPACT_HIGH:
    "یہ قیمت بازار سے {{gap}}% کم ہے، جو Kawase کی اجازت {{max}}% سے زیادہ ہے۔ کم رقم آزمائیں یا انتظار کریں۔",
  RATE_BELOW_REFERENCE: "یہ قیمت بازار کی شرح سے {{gap}}% کم ہے۔",
  fixTryAgain: "دوبارہ کوشش کریں",
  BRAKE_PRICE_IMPACT: "یہ قیمت بازار سے {{gap}}% کم ہے، جو آپ کے {{max}}% اصول سے زیادہ ہے۔",
};
