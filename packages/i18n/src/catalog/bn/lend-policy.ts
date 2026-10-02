import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Aave-এ ধার নিতে ও আয় করতে সাইন ইন করুন।",
  ON_OTHER_NETWORK: "Aave V4 {{network}}-এ চলে।",
  NOT_AVAILABLE_YET: "এখন ধার নেওয়া যাচ্ছে না।",
  PAUSED_ALL: "আপনি সব টাকা লেনদেন থামিয়ে রেখেছেন। চালিয়ে যেতে সেটিংসে আবার চালু করুন।",
  WALLET_NOT_READY: "আগে আপনার ওয়ালেট সেট আপ করুন।",
  WALLET_NOT_SET_UP: "আগে এই নেটওয়ার্কে আপনার ওয়ালেট সেট আপ করুন।",
  ASSET_UNCLEAR: "কোন সম্পদ?",
  LEND_ASSET_UNAVAILABLE: "Aave V4 এখানে এর জন্য {{asset}} দেয় না।",
  LEND_NOT_COLLATERAL: "{{asset}} এখানে জামানত হিসেবে গ্রহণযোগ্য নয়। cirBTC, WETH ও USDC গ্রহণযোগ্য।",
  LEND_NOTHING_OWED: "আপনার কোনো {{asset}} দেনা নেই।",
  AMOUNT_MISSING: "কত?",
  AMOUNT_INVALID: "এই পরিমাণ বৈধ নয়।",
  INSUFFICIENT_BALANCE: "যথেষ্ট {{asset}} নেই। আপনার আছে {{balance}}।",
  OVER_POSITION: "Aave-এ আপনার {{position}} আছে।",
  INSUFFICIENT_GAS: "নেটওয়ার্ক ফির জন্য একটু USDC রাখুন।",
  HEALTH_TOO_LOW: "এতে হেলথ {{health}} হবে। Kawase এটি {{min}}-এর উপরে রাখে: কম ধার নিন বা বেশি রাখুন।",
  HEALTH_NEAR_LIMIT: "হেলথ হবে {{health}}, সীমার কাছে। দামের সামান্য পতন একে ঝুঁকিতে ফেলতে পারে।",
  fixSwitch: "Arc-এ যান",
};
