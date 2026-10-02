import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "এই নেটওয়ার্কে সোয়াপ এখনও নেই।",
  ON_OTHER_NETWORK: "সোয়াপ {{network}}-এ কাজ করে।",
  PAUSED_ALL: "আপনি সব টাকার লেনদেন থামিয়ে রেখেছেন। চালিয়ে যেতে সেটিংসে আবার চালু করুন।",
  SIGN_IN_REQUIRED: "সোয়াপ করতে সাইন ইন করুন।",
  WALLET_NOT_READY: "আগে আপনার ওয়ালেট সেট আপ করুন।",
  WALLET_NOT_SET_UP: "আগে এই নেটওয়ার্কে আপনার ওয়ালেট সেট আপ করুন।",
  INSUFFICIENT_BALANCE: "যথেষ্ট টাকা নেই। আপনার আছে {{balance}}।",
  INSUFFICIENT_GAS: "নেটওয়ার্ক ফির জন্য প্রায় {{needed}} রাখুন।",
  AMOUNT_MISSING: "কত?",
  AMOUNT_INVALID: "এই পরিমাণটি সঠিক নয়।",
  ASSET_UNCLEAR: "USDC থেকে না EURC থেকে?",
  SWAP_SAME_TOKEN: "দুটি আলাদা মুদ্রা বেছে নিন।",
  SWAP_PAIR_UNSUPPORTED: "Kawase এখানে এগুলো সোয়াপ করতে পারে না।",
  QUOTE_UNAVAILABLE: "এখন কোনো দাম নেই।",
  PRICE_IMPACT_HIGH:
    "এই দাম বাজারের চেয়ে {{gap}}% কম, Kawase-এর অনুমোদিত {{max}}%-এর বেশি। কম পরিমাণ চেষ্টা করুন বা অপেক্ষা করুন।",
  RATE_BELOW_REFERENCE: "এই দাম বাজার রেটের চেয়ে {{gap}}% কম।",
  fixTryAgain: "আবার চেষ্টা করুন",
};
