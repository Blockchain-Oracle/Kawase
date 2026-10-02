import type { Catalog } from "../en/index";

export const earnPolicy: Catalog["earnPolicy"] = {
  NOT_AVAILABLE_YET: "इस नेटवर्क पर कमाई अभी उपलब्ध नहीं है।",
  ON_OTHER_NETWORK: "कमाई {{network}} पर काम करती है।",
  PAUSED_ALL: "आपने पैसे की सारी आवाजाही रोक दी है। जारी रखने के लिए सेटिंग्स में फिर शुरू करें।",
  SIGN_IN_REQUIRED: "कमाने के लिए साइन इन करें।",
  WALLET_NOT_READY: "पहले अपना वॉलेट सेट करें।",
  WALLET_NOT_SET_UP: "पहले इस नेटवर्क पर अपना वॉलेट सेट करें।",
  VAULT_UNAVAILABLE: "यह वॉल्ट यहाँ उपलब्ध नहीं है।",
  AMOUNT_MISSING: "कितना?",
  AMOUNT_INVALID: "यह राशि मान्य नहीं है।",
  INSUFFICIENT_BALANCE: "USDC कम है। आपके पास {{balance}} है।",
  INSUFFICIENT_GAS: "नेटवर्क शुल्क के लिए लगभग {{needed}} रखें।",
  OVER_POSITION: "यह इस वॉल्ट में आपकी रकम ({{position}}) से ज़्यादा है।",
  VAULT_LIQUIDITY_SHORT: "वॉल्ट अभी सिर्फ़ {{available}} दे सकता है; बाकी उधार पर है। कम राशि या बाद में आज़माएँ।",
  VAULT_LOW_LIQUIDITY: "कम तरलता: निकासी में इंतज़ार करना पड़ सकता है",
  VAULT_RISK_WARNING: "App Kit इस वॉल्ट को चिह्नित करता है: {{warnings}}",
};
