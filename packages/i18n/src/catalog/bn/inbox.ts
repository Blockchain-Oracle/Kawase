import type { Catalog } from "../en/index";

export const inbox: Catalog["inbox"] = {
  title: "ইনবক্স",
  emptyTitle: "সব শান্ত",
  emptyBody: "যেসব বিষয়ে আপনাকে দরকার আর Kawase যা করেছে, তা এখানে দেখা যাবে।",
  receivedFrom: "{{name}}-এর কাছ থেকে এসেছে",
  requestPaid: "আপনার অনুরোধের পেমেন্ট হয়েছে",
  requestPaidBy: "{{name}}-এর কাছ থেকে {{amount}}",
  sentTo: "{{name}}-কে পাঠানো হয়েছে",
  unread: "নতুন",
  markAllRead: "সব পঠিত করুন",
  loadFailed: "আপনার ইনবক্স লোড করা যায়নি।",
  bellUnread: "ইনবক্স, {{count}}টি নতুন",
  askedYou: "{{name}} আপনার কাছে {{amount}} চেয়েছেন",
  pay: "পেমেন্ট করুন",
};
