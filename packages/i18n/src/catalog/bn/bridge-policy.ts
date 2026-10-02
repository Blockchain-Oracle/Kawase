import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "এই নেটওয়ার্কে ব্রিজ এখনও নেই।",
  ON_OTHER_NETWORK: "ব্রিজ {{network}}-এ কাজ করে।",
  PAUSED_ALL: "আপনি সব টাকার লেনদেন থামিয়ে রেখেছেন। চালিয়ে যেতে সেটিংসে আবার চালু করুন।",
  SIGN_IN_REQUIRED: "ব্রিজ করতে সাইন ইন করুন।",
  WALLET_NOT_READY: "আগে আপনার ওয়ালেট সেট আপ করুন।",
  WALLET_NOT_SET_UP: "আগে এই নেটওয়ার্কে আপনার ওয়ালেট সেট আপ করুন।",
  DESTINATION_MISSING: "কোন চেইনে?",
  AMOUNT_MISSING: "কত?",
  AMOUNT_INVALID: "এই পরিমাণটি সঠিক নয়।",
  INSUFFICIENT_BALANCE: "যথেষ্ট USDC নেই। আপনার আছে {{balance}}।",
  INSUFFICIENT_GAS: "নেটওয়ার্ক ফির জন্য Arc-এ প্রায় {{needed}} রাখুন।",
  AMOUNT_BELOW_FEE: "এটা রুট ফি ({{fee}} পর্যন্ত)-এর চেয়ে কম। বেশি পাঠান।",
  QUOTE_UNAVAILABLE: "এখন কোনো রুট নেই।",
};
