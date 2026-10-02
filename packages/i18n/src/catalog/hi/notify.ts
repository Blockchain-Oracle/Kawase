import type { Catalog } from "../en/index";

export const notify: Catalog["notify"] = {
  testnet: "टेस्टनेट",
  receivedTitle: "{{amount}} मिले",
  receivedBody: "{{name}} से",
  requestPaidTitle: "आपके अनुरोध का भुगतान हुआ",
  requestPaidBody: "{{name}} से {{amount}}",
  sentTitle: "{{amount}} भेजे",
  sentBody: "{{name}} को",
  skippedTitle: "एक ऑटोमेशन छोड़ा गया",
  skippedBody: "कुछ नहीं भेजा गया। वजह देखने के लिए Kawase खोलें।",
  emailOpen: "Kawase खोलें",
  emailNeverApprove: "Kawase कभी भी ईमेल से कुछ मंज़ूर करने या साइन करने को नहीं कहता।",
  emailWhy: "आपको यह इसलिए मिला क्योंकि यह Kawase में चालू है। इसे सेटिंग → सूचनाएँ में बदलें।",
};
