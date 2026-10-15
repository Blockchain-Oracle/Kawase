import type { Catalog } from "../en/index";

export const wallet: Catalog["wallet"] = {
  title: "ওয়ালেট",
  creating: "আপনার ওয়ালেট তৈরি হচ্ছে…",
  settingUp: "{{network}}-এ আপনার ওয়ালেট সেট হচ্ছে…",
  ready: "আপনার ওয়ালেট প্রস্তুত",
  address: "ঠিকানা",
  balance: "ব্যালেন্স",
  noWallet: "ওয়ালেট পেতে সাইন ইন করুন",
  setupNeeded: "{{network}}-এ সেট করুন",
  setUp: "সেট করুন",
  allowanceTitle: "দৈনিক সীমা",
  allowanceBody:
    "Kawase না জিজ্ঞেস করে আপনার হয়ে দিনে {{amount}} পর্যন্ত পাঠাতে পারে। এর বেশি হলে আপনি Face ID দিয়ে অনুমোদন দেবেন।",
  allowanceBodyAndroid:
    "Kawase না জিজ্ঞেস করে আপনার হয়ে দিনে {{amount}} পর্যন্ত পাঠাতে পারে। এর বেশি হলে আপনি আঙুলের ছাপ বা স্ক্রিন লক দিয়ে অনুমোদন দেবেন।",
  allowanceAccept: "গ্রহণ করুন",
  allowanceAcceptFaceId: "Face ID দিয়ে গ্রহণ করুন",
  allowanceActive: "চালু · দিনে {{amount}}",
  allowanceOff: "বন্ধ",
  allowanceRevoke: "বন্ধ করুন",
  mainnetConsentTitle: "আসল টাকা",
  mainnetConsentBody:
    "মেইননেটে আসল USDC ব্যবহার হয়। Kawase শুধু আপনার ঠিক করা সীমার মধ্যেই তা চালায়, আর আপনার Face ID ছাড়া কখনও সীমার বেশি নয়।",
  mainnetConsentBodyWeb:
    "মেইননেটে আসল USDC ব্যবহার হয়। Kawase শুধু আপনার ঠিক করা সীমার মধ্যে এটি পাঠায়, আর আপনার নিশ্চিতকরণ ছাড়া কখনও আপনার দৈনিক সীমার বেশি নয়।",
  mainnetConsentBodyAndroid:
    "মেইননেটে আসল USDC ব্যবহার হয়। Kawase শুধু আপনার ঠিক করা সীমার মধ্যেই তা চালায়, আর আপনার আঙুলের ছাপ বা স্ক্রিন লক ছাড়া কখনও সীমার বেশি নয়।",
  mainnetConsentAccept: "বুঝেছি",
  testnetMoney: "টেস্ট USDC-র কোনো মূল্য নেই।",
  confirmInBrowser: "আপনার ওয়ালেট এই ব্রাউজারে সই করে। আপনি নিশ্চিত না করা পর্যন্ত কিছুই সই হয় না।",
  exportKeyTitle: "আপনার প্রাইভেট কি-ই আপনার ওয়ালেট",
  exportKeyWarning1: "এই কি যার কাছে থাকবে, সে যেকোনো অ্যাপ থেকে আপনার ওয়ালেটের সবকিছু নিয়ে নিতে পারবে।",
  exportKeyWarning2: "Kawase কখনও এটি চায় না। কোনো ওয়েবসাইট বা চ্যাটে কখনও এটি পেস্ট করবেন না।",
  exportKeyWindow: "এটি Privy-র নিরাপদ উইন্ডোতে খোলে। Kawase কখনও এটি দেখে না।",
  exportKeyOnWeb: "এটি Kawase ওয়েবসাইটে খোলে। সেখানে একই ইমেল দিয়ে সাইন ইন করুন, Privy-র নিরাপদ উইন্ডো এটি দেখাবে।",
  exportKeyReveal: "প্রাইভেট কি দেখান",
  exportKeyOpenWeb: "ওয়েবসাইটে এক্সপোর্ট করুন",
  oauthReturnTitle: "আপনার সাইন ইন শেষ হচ্ছে",
  oauthReturnGoogle: "আপনার Google অ্যাকাউন্ট দিয়ে",
  oauthReturnApple: "আপনার Apple অ্যাকাউন্ট দিয়ে",
  creatingVerb: "আপনার ওয়ালেট তৈরি হচ্ছে",
  signingInVerb: "সাইন ইন হচ্ছে",
};
