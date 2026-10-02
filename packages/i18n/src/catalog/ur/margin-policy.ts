import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "ٹریڈ کے لیے سائن ان کریں۔",
  ON_OTHER_NETWORK: "لانگ اور شارٹ {{network}} پر چلتے ہیں۔",
  NOT_AVAILABLE_YET: "لانگ اور شارٹ ابھی دستیاب نہیں۔",
  PAUSED_ALL: "آپ نے رقم کی ہر منتقلی روک دی ہے۔ جاری رکھنے کے لیے سیٹنگز میں دوبارہ شروع کریں۔",
  WALLET_NOT_READY: "پہلے اپنا والیٹ سیٹ اپ کریں۔",
  WALLET_NOT_SET_UP: "پہلے اس نیٹ ورک پر اپنا والیٹ سیٹ اپ کریں۔",
  MARKET_MISSING: "کون سی مارکیٹ؟",
  SIDE_MISSING: "لانگ یا شارٹ؟",
  MARGIN_MARKET_UNAVAILABLE:
    "کوئی قرض مارکیٹ {{market}} درج نہیں کرتی، اس لیے یہاں اس پر لانگ یا شارٹ نہیں ہو سکتا۔ اسے خریدیں، یا قیمت کا الرٹ لگائیں۔",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} یہاں {{side}} نہیں ہو سکتا۔ اس پر لانگ عام خریداری ہے۔",
  POSITION_MISSING: "ایسی کوئی کھلی پوزیشن نہیں۔",
  AMOUNT_MISSING: "کتنا مارجن؟",
  AMOUNT_INVALID: "یہ رقم درست نہیں۔",
  INSUFFICIENT_BALANCE: "USDC کافی نہیں۔ آپ کے پاس {{balance}} ہیں۔",
  INSUFFICIENT_GAS: "نیٹ ورک فیس کے لیے تقریباً {{needed}} رکھیں۔",
  LEVERAGE_TOO_HIGH: "یہ مارکیٹ {{max}}× تک کی اجازت دیتی ہے۔",
  QUOTE_UNAVAILABLE: "ابھی کوئی قیمت نہیں۔",
  MARGIN_RISK: "لیوریج سے آپ کا پورا مارجن جا سکتا ہے۔",
  fixTryAgain: "دوبارہ کوشش کریں",
  fixSwitch: "Arc پر جائیں",
  BRAKE_LEVERAGE: "{{leverage}}× پانچ گنا سے زیادہ ہے: آپ کے خلاف چھوٹی سی حرکت مارجن ختم کر سکتی ہے۔",
};
