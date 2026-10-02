import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "{{name}}-এ নতুন সাইন-ইন",
  deviceSignedInBody:
    "{{platform}} · {{location}}। এটি আপনি না হলে, ডিভাইস থেকে এটি সাইন আউট করুন এবং “সব থামান” চালু করুন।",
  deviceSignedInBodyNoPlace: "{{platform}}। এটি আপনি না হলে, ডিভাইস থেকে এটি সাইন আউট করুন এবং “সব থামান” চালু করুন।",
  deviceSignedOutTitle: "{{name}} থেকে সাইন আউট হয়েছে",
  deviceSignedOutBody: "এটি আর আপনার অ্যাকাউন্ট ব্যবহার করতে পারবে না। এটি আপনি না করে থাকলে, এখনই ডিভাইস দেখুন।",
  invoiceDueSoonTitle: "ইনভয়েস {{number}}-এর শেষ তারিখ আগামীকাল",
  invoiceDueTodayTitle: "ইনভয়েস {{number}}-এর শেষ তারিখ আজ",
  invoiceDueBody: "{{client}}-এর কাছে {{amount}} পাওনা।",
  invoiceOverdueTitle: "ইনভয়েস {{number}}-এর মেয়াদ পেরিয়েছে",
  invoiceOverdueBody: "{{client}}-এর কাছে এখনও {{amount}} পাওনা (শেষ তারিখ ছিল {{date}})।",
  kindDeviceSignedIn: "নতুন সাইন-ইন",
  kindDeviceSignedOut: "সাইন আউট হওয়া ডিভাইস",
  kindInvoiceDue: "শেষ তারিখ ঘনিয়ে আসা ইনভয়েস",
  kindInvoiceOverdue: "মেয়াদোত্তীর্ণ ইনভয়েস",
  aDevice: "একটি ডিভাইস",
};
