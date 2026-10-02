import type { Catalog } from "../en/index";

export const swapPolicy: Catalog["swapPolicy"] = {
  NOT_AVAILABLE_YET: "इस नेटवर्क पर स्वैप अभी उपलब्ध नहीं है।",
  ON_OTHER_NETWORK: "स्वैप {{network}} पर काम करता है।",
  PAUSED_ALL: "आपने पैसे की सारी आवाजाही रोक दी है। जारी रखने के लिए सेटिंग्स में फिर शुरू करें।",
  SIGN_IN_REQUIRED: "स्वैप करने के लिए साइन इन करें।",
  WALLET_NOT_READY: "पहले अपना वॉलेट सेट करें।",
  WALLET_NOT_SET_UP: "पहले इस नेटवर्क पर अपना वॉलेट सेट करें।",
  INSUFFICIENT_BALANCE: "पैसे कम हैं। आपके पास {{balance}} है।",
  INSUFFICIENT_GAS: "नेटवर्क शुल्क के लिए लगभग {{needed}} रखें।",
  AMOUNT_MISSING: "कितना?",
  AMOUNT_INVALID: "यह राशि मान्य नहीं है।",
  ASSET_UNCLEAR: "USDC से या EURC से?",
  SWAP_SAME_TOKEN: "दो अलग मुद्राएँ चुनें।",
  SWAP_PAIR_UNSUPPORTED: "Kawase इन्हें यहाँ स्वैप नहीं कर सकता।",
  QUOTE_UNAVAILABLE: "अभी कोई कीमत नहीं है।",
  PRICE_IMPACT_HIGH: "यह कीमत बाज़ार से {{gap}}% कम है, Kawase की सीमा {{max}}% से ज़्यादा। कम राशि आज़माएँ या रुकें।",
  RATE_BELOW_REFERENCE: "यह कीमत बाज़ार दर से {{gap}}% कम है।",
  fixTryAgain: "फिर कोशिश करें",
};
