import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Aave پر قرض لینے اور کمانے کے لیے سائن ان کریں۔",
  ON_OTHER_NETWORK: "Aave V4 ‏{{network}} پر چلتا ہے۔",
  NOT_AVAILABLE_YET: "قرض ابھی دستیاب نہیں۔",
  PAUSED_ALL: "آپ نے رقم کی تمام منتقلی روک دی ہے۔ جاری رکھنے کے لیے سیٹنگز میں دوبارہ شروع کریں۔",
  WALLET_NOT_READY: "پہلے اپنا والیٹ سیٹ اپ کریں۔",
  WALLET_NOT_SET_UP: "پہلے اس نیٹ ورک پر اپنا والیٹ سیٹ اپ کریں۔",
  ASSET_UNCLEAR: "کون سا اثاثہ؟",
  LEND_ASSET_UNAVAILABLE: "Aave V4 یہاں اس کے لیے {{asset}} پیش نہیں کرتا۔",
  LEND_NOT_COLLATERAL: "{{asset}} یہاں ضمانت کے طور پر قبول نہیں۔ cirBTC، WETH اور USDC قبول ہیں۔",
  LEND_NOTHING_OWED: "آپ پر کوئی {{asset}} واجب نہیں۔",
  AMOUNT_MISSING: "کتنا؟",
  AMOUNT_INVALID: "یہ رقم درست نہیں۔",
  INSUFFICIENT_BALANCE: "{{asset}} کافی نہیں۔ آپ کے پاس {{balance}} ہے۔",
  OVER_POSITION: "Aave میں آپ کے {{position}} ہیں۔",
  INSUFFICIENT_GAS: "نیٹ ورک فیس کے لیے تھوڑا USDC رکھیں۔",
  HEALTH_TOO_LOW:
    "اس سے صحت {{health}} ہو جائے گی۔ Kawase اسے {{min}} سے اوپر رکھتا ہے: کم قرض لیں یا زیادہ ضمانت رکھیں۔",
  HEALTH_NEAR_LIMIT: "صحت {{health}} ہو گی، حد کے قریب۔ قیمت میں تھوڑی کمی اسے خطرے میں ڈال سکتی ہے۔",
  fixSwitch: "Arc پر جائیں",
};
