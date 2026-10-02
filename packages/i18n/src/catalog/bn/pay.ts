import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "{{amount}} পেমেন্ট করুন",
  signInToPay: "পেমেন্ট করতে সাইন ইন করুন",
  otherWallet: "অন্য ওয়ালেট থেকে পেমেন্ট করুন",
  otherWalletBody: "{{network}}-এ এই ঠিকানায় ঠিক {{amount}} পাঠান। পৌঁছালে অনুরোধটি পেমেন্ট হয়েছে বলে দেখাবে।",
  ownRequest: "এটি আপনার নিজের অনুরোধ। যিনি পেমেন্ট করবেন তাঁকে লিংকটি পাঠান।",
  paidTitle: "ইতিমধ্যে পেমেন্ট হয়েছে",
  paidBody: "এই অনুরোধের পেমেন্ট হয়ে গেছে। আর কিছু করার নেই।",
  canceledTitle: "অনুরোধ বাতিল হয়েছে",
  canceledBody: "{{name}} এই অনুরোধ বাতিল করেছেন। কিছু পেমেন্ট করতে হবে না।",
  expiredTitle: "অনুরোধের মেয়াদ শেষ",
  expiredBody: "এই লিংক আর খোলা নেই। {{name}}-এর কাছে নতুন লিংক চান।",
  notFoundTitle: "অনুরোধ পাওয়া যায়নি",
  notFoundBody: "লিংকটি দেখে নিন, অথবা নতুন লিংক চান।",
  loadFailed: "এই অনুরোধ লোড করা যায়নি।",
};
