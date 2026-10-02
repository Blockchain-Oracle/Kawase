import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "اس نیٹ ورک پر کمائی ابھی دستیاب نہیں۔",
  ON_OTHER_NETWORK: "کمائی {{network}} پر کام کرتی ہے۔",
  PAUSED_ALL: "آپ نے رقم کی تمام نقل و حرکت روک دی ہے۔ جاری رکھنے کے لیے سیٹنگز میں دوبارہ شروع کریں۔",
  SIGN_IN_REQUIRED: "کمانے کے لیے سائن ان کریں۔",
  WALLET_NOT_READY: "پہلے اپنا والٹ سیٹ اپ کریں۔",
  WALLET_NOT_SET_UP: "پہلے اس نیٹ ورک پر اپنا والٹ سیٹ اپ کریں۔",
  VAULT_UNAVAILABLE: "یہ والٹ یہاں دستیاب نہیں۔",
  AMOUNT_MISSING: "کتنا؟",
  AMOUNT_INVALID: "یہ رقم درست نہیں۔",
  INSUFFICIENT_BALANCE: "‏USDC کافی نہیں۔ آپ کے پاس {{balance}} ہے۔",
  INSUFFICIENT_GAS: "نیٹ ورک فیس کے لیے تقریباً {{needed}} رکھیں۔",
  OVER_POSITION: "یہ اس والٹ میں آپ کی رقم ({{position}}) سے زیادہ ہے۔",
  VAULT_LIQUIDITY_SHORT: "والٹ ابھی صرف {{available}} دے سکتا ہے؛ باقی قرض پر ہے۔ کم رقم یا بعد میں آزمائیں۔",
  VAULT_LOW_LIQUIDITY: "کم لیکویڈیٹی: نکاسی میں انتظار کرنا پڑ سکتا ہے",
  VAULT_RISK_WARNING: "‏App Kit اس والٹ کو نشان زد کرتا ہے: {{warnings}}",
  VAULT_LIQUIDITY_STUCK:
    "یہ والٹ ابھی صرف {{available}} واپس دے سکتا ہے، اس لیے Kawase اس میں رقم نہیں ڈالے گا۔ لیکویڈیٹی والا چنیں۔",
};
