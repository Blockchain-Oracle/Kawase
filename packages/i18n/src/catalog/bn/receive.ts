import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "গ্রহণ করুন",
  warning: "শুধু Arc-এ USDC ও EURC। অন্য নেটওয়ার্কে পাঠানো টাকা Kawase দেখতে পায় না।",
  copy: "ঠিকানা কপি করুন",
  share: "শেয়ার করুন",
  network: "নেটওয়ার্ক",
  shareMessage: "{{network}}-এ আমার Kawase ঠিকানা: {{address}}",
  noWallet: "ঠিকানা পেতে সাইন ইন করুন",
  noWalletBody: "আপনার ঠিকানা অ্যাকাউন্টের সাথে তৈরি হয়।",
  setUpFirst: "আগে আপনার ওয়ালেট সেট আপ করুন",
  setUpFirstBody: "এক ধাপ, আর আপনার ঠিকানা টাকা নিতে প্রস্তুত।",
  anyToken:
    "Arc-এ যেকোনো টোকেন এখানে আসে। অন্য চেইনে পাঠানো হয়েছে? সেটি সেখানে এই একই ঠিকানায় পৌঁছায়: “টাকা যোগ করুন” থেকে Arc-এ আনুন।",
};
