import type { Catalog } from "../en/index";

export const movePolicy: Catalog["movePolicy"] = {
  SIGN_IN_REQUIRED: "नेटवर्क के बीच पैसा भेजने के लिए साइन इन करें।",
  ON_OTHER_NETWORK: "यह दूसरे नेटवर्क पर चलता है।",
  NOT_AVAILABLE_YET: "नेटवर्क के बीच भेजना अभी उपलब्ध नहीं है।",
  PAUSED_ALL: "आपने सारा पैसा आना-जाना रोक दिया है। जारी रखने के लिए सेटिंग्स में फिर से शुरू करें।",
  WALLET_NOT_READY: "पहले अपना वॉलेट सेट करें।",
  WALLET_NOT_SET_UP: "पहले इस नेटवर्क पर अपना वॉलेट सेट करें।",
  DESTINATION_MISSING: "कौन सा नेटवर्क?",
  RECIPIENT_INVALID: "{{query}} मान्य पता नहीं है।",
  RECIPIENT_UNKNOWN: "{{query}} कौन है? सहेजा संपर्क, @हैंडल या पता इस्तेमाल करें।",
  RECIPIENT_NO_WALLET: "@{{handle}} का अभी Kawase वॉलेट नहीं है।",
  RECIPIENT_AMBIGUOUS: "एक से ज़्यादा संपर्क मिलते हैं। कौन सा?",
  LOOKALIKE_ADDRESS: "यह {{name}} के पते जैसा दिखता है पर वह नहीं है। जाँच लें।",
  FIRST_TIME_RECIPIENT: "इस पते पर पहला भुगतान। भेजने से पहले जाँच लें।",
  AMOUNT_MISSING: "कितना?",
  AMOUNT_INVALID: "यह राशि मान्य नहीं है।",
  INSUFFICIENT_BALANCE: "वहाँ USDC काफ़ी नहीं। आपके पास {{balance}} हैं।",
  INSUFFICIENT_GAS: "नेटवर्क शुल्क के लिए Arc पर लगभग {{needed}} रखें।",
  QUOTE_UNAVAILABLE: "अभी कोई रास्ता इसे नहीं ले जा सकता।",
};
