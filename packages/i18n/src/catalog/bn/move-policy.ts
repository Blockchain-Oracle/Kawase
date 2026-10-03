import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "নেটওয়ার্কের মধ্যে টাকা পাঠাতে সাইন ইন করুন।",
  ON_OTHER_NETWORK: "এটি অন্য নেটওয়ার্কে চলে।",
  NOT_AVAILABLE_YET: "নেটওয়ার্কের মধ্যে পাঠানো এখন পাওয়া যাচ্ছে না।",
  PAUSED_ALL: "আপনি সব টাকা চলাচল থামিয়েছেন। চালিয়ে যেতে সেটিংসে আবার চালু করুন।",
  WALLET_NOT_READY: "আগে আপনার ওয়ালেট সেট আপ করুন।",
  WALLET_NOT_SET_UP: "আগে এই নেটওয়ার্কে আপনার ওয়ালেট সেট আপ করুন।",
  DESTINATION_MISSING: "কোন নেটওয়ার্ক?",
  RECIPIENT_INVALID: "{{query}} সঠিক ঠিকানা নয়।",
  RECIPIENT_UNKNOWN: "{{query}} কে? সংরক্ষিত পরিচিতি, @হ্যান্ডেল বা ঠিকানা ব্যবহার করুন।",
  RECIPIENT_NO_WALLET: "@{{handle}}-এর এখনো Kawase ওয়ালেট নেই।",
  RECIPIENT_AMBIGUOUS: "একাধিক পরিচিতি মেলে। কোনটি?",
  LOOKALIKE_ADDRESS: "এটি {{name}}-এর ঠিকানার মতো, কিন্তু সেটি নয়। যাচাই করুন।",
  FIRST_TIME_RECIPIENT: "এই ঠিকানায় প্রথম পেমেন্ট। পাঠানোর আগে যাচাই করুন।",
  AMOUNT_MISSING: "কত?",
  AMOUNT_INVALID: "এই পরিমাণটি সঠিক নয়।",
  INSUFFICIENT_BALANCE: "সেখানে যথেষ্ট {{asset}} নেই। আপনার আছে {{balance}}।",
  INSUFFICIENT_GAS: "নেটওয়ার্ক ফির জন্য প্রায় {{needed}} রাখুন।",
  QUOTE_UNAVAILABLE: "এখন কোনো রুট এটি নিতে পারছে না।",
  MOVE_ASSET_UNKNOWN: "Kawase সেখানে {{asset}} খুঁজে পাচ্ছে না। কোন সম্পদের কথা বলছেন?",
  TOKEN_BLOCKED: "{{symbol}} অন্য একটি টোকেনের নকল করে, তাই Kawase এটি পাঠাবে না।",
};
