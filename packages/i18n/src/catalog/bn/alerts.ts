import type { Catalog } from "../en/index";

export const alerts: Catalog["alerts"] = {
  deviceSignedInTitle: "{{name}}-এ নতুন সাইন-ইন",
  deviceSignedInBody:
    "{{platform}} · {{location}}। এটি আপনি না হলে, ডিভাইস থেকে এটি সাইন আউট করুন এবং “সব থামান” চালু করুন।",
  deviceSignedInBodyNoPlace: "{{platform}}। এটি আপনি না হলে, ডিভাইস থেকে এটি সাইন আউট করুন এবং “সব থামান” চালু করুন।",
  deviceSignedOutTitle: "{{name}} থেকে সাইন আউট হয়েছে",
  deviceSignedOutBody: "এটি আর আপনার অ্যাকাউন্ট ব্যবহার করতে পারবে না। এটি আপনি না করে থাকলে, এখনই ডিভাইস দেখুন।",
  kindDeviceSignedIn: "নতুন সাইন-ইন",
  kindDeviceSignedOut: "সাইন আউট হওয়া ডিভাইস",
  aDevice: "একটি ডিভাইস",
};
