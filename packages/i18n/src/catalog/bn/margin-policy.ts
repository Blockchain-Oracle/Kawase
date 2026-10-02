import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "ট্রেড করতে সাইন ইন করুন।",
  ON_OTHER_NETWORK: "লং ও শর্ট {{network}}-এ চলে।",
  NOT_AVAILABLE_YET: "লং ও শর্ট এখন পাওয়া যাচ্ছে না।",
  PAUSED_ALL: "আপনি সব টাকা চলাচল থামিয়েছেন। চালিয়ে যেতে সেটিংসে আবার চালু করুন।",
  WALLET_NOT_READY: "আগে আপনার ওয়ালেট সেট আপ করুন।",
  WALLET_NOT_SET_UP: "আগে এই নেটওয়ার্কে আপনার ওয়ালেট সেট আপ করুন।",
  MARKET_MISSING: "কোন বাজার?",
  SIDE_MISSING: "লং না শর্ট?",
  MARGIN_MARKET_UNAVAILABLE:
    "কোনো ঋণ বাজার {{market}} তালিকাভুক্ত করে না, তাই এখানে এতে লং বা শর্ট করা যায় না। এটি কিনুন, বা দামের অ্যালার্ট দিন।",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} এখানে {{side}} করা যায় না। এতে লং মানে সাধারণ কেনা।",
  POSITION_MISSING: "এমন কোনো খোলা পজিশন নেই।",
  AMOUNT_MISSING: "কত মার্জিন?",
  AMOUNT_INVALID: "এই পরিমাণটি সঠিক নয়।",
  INSUFFICIENT_BALANCE: "যথেষ্ট USDC নেই। আপনার আছে {{balance}}।",
  INSUFFICIENT_GAS: "নেটওয়ার্ক ফির জন্য প্রায় {{needed}} রাখুন।",
  LEVERAGE_TOO_HIGH: "এই বাজারে {{max}}× পর্যন্ত লিভারেজ চলে।",
  QUOTE_UNAVAILABLE: "এখন কোনো দাম নেই।",
  MARGIN_RISK: "লিভারেজে আপনার পুরো মার্জিন হারাতে পারেন।",
  fixTryAgain: "আবার চেষ্টা করুন",
  fixSwitch: "Arc-এ যান",
  BRAKE_LEVERAGE: "{{leverage}}× পাঁচ গুণের বেশি: আপনার বিপক্ষে ছোট একটা নড়াচড়াও মার্জিন মুছে দিতে পারে।",
};
