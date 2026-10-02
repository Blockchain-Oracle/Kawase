import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "এই নেটওয়ার্কে আয় এখনও নেই।",
  ON_OTHER_NETWORK: "আয় {{network}}-এ কাজ করে।",
  PAUSED_ALL: "আপনি সব টাকার লেনদেন থামিয়ে রেখেছেন। চালিয়ে যেতে সেটিংসে আবার চালু করুন।",
  SIGN_IN_REQUIRED: "আয় করতে সাইন ইন করুন।",
  WALLET_NOT_READY: "আগে আপনার ওয়ালেট সেট আপ করুন।",
  WALLET_NOT_SET_UP: "আগে এই নেটওয়ার্কে আপনার ওয়ালেট সেট আপ করুন।",
  VAULT_UNAVAILABLE: "এই ভল্ট এখানে নেই।",
  AMOUNT_MISSING: "কত?",
  AMOUNT_INVALID: "এই পরিমাণটি সঠিক নয়।",
  INSUFFICIENT_BALANCE: "যথেষ্ট USDC নেই। আপনার আছে {{balance}}।",
  INSUFFICIENT_GAS: "নেটওয়ার্ক ফির জন্য প্রায় {{needed}} রাখুন।",
  OVER_POSITION: "এই ভল্টে আপনার যা আছে ({{position}}) তার চেয়ে বেশি।",
  VAULT_LIQUIDITY_SHORT: "ভল্ট এখন শুধু {{available}} দিতে পারে; বাকিটা ধার দেওয়া। কম বা পরে চেষ্টা করুন।",
  VAULT_LOW_LIQUIDITY: "তারল্য কম: তোলায় অপেক্ষা করতে হতে পারে",
  VAULT_RISK_WARNING: "App Kit এই ভল্ট চিহ্নিত করেছে: {{warnings}}",
  VAULT_LIQUIDITY_STUCK:
    "এই ভল্ট এখন মাত্র {{available}} ফেরত দিতে পারে, তাই Kawase এতে টাকা রাখবে না। তারল্য আছে এমন একটি বেছে নিন।",
};
