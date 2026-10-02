import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "টেস্টনেট",
  receivedTitle: "{{amount}} এসেছে",
  receivedBody: "{{name}}-এর কাছ থেকে",
  requestPaidTitle: "আপনার অনুরোধের পেমেন্ট হয়েছে",
  requestPaidBody: "{{name}}-এর কাছ থেকে {{amount}}",
  sentTitle: "{{amount}} পাঠানো হয়েছে",
  sentBody: "{{name}}-কে",
  skippedTitle: "একটি অটোমেশন বাদ পড়েছে",
  skippedBody: "কিছুই পাঠানো হয়নি। কারণ দেখতে Kawase খুলুন।",
  emailOpen: "Kawase খুলুন",
  emailNeverApprove: "Kawase কখনো ইমেইলে কিছু অনুমোদন বা সই করতে বলে না।",
  emailWhy: "Kawase-এ এটি চালু আছে বলে আপনি এটি পাচ্ছেন। সেটিংস → বিজ্ঞপ্তি থেকে বদলান।",
};
