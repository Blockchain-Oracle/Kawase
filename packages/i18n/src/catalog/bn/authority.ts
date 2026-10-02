import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "Kawase পারে",
  never: "Kawase কখনো পারে না",
  worst: "সবচেয়ে খারাপ ক্ষেত্রে",
  canSendDaily: "আপনার ওয়ালেট থেকে দিনে {{amount}} পর্যন্ত পাঠাতে",
  canSendPeriod: "আপনার ওয়ালেট থেকে প্রতি মেয়াদে {{amount}} পর্যন্ত পাঠাতে",
  canNoPrompt: "প্রতিবার আপনাকে না জিজ্ঞেস করে",
  neverMore: "এক দিনে {{amount}}-এর বেশি পাঠাতে",
  neverOtherTokens: "অন্য কোনো টোকেন বা কন্ট্রাক্টে হাত দিতে",
  neverLimits: "আপনার সীমা বা এই অনুমতি বদলাতে",
  worstCase: "সব কিছু ভুল হলেও এক দিনে সর্বোচ্চ {{amount}} যেতে পারে — আর আপনি যেকোনো সময় এটা বন্ধ করতে পারেন।",
  meta: "{{network}} · {{date}} পর্যন্ত",
  unknownTerms: "এই অনুমতিতে এমন শর্ত আছে যা Kawase পড়তে পারে না। এই সারাংশের ওপর ভরসা করবেন না।",
};
