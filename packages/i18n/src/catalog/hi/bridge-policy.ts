import type { Catalog } from "../en/index";

export const bridgePolicy: Catalog["bridgePolicy"] = {
  NOT_AVAILABLE_YET: "इस नेटवर्क पर ब्रिज अभी उपलब्ध नहीं है।",
  ON_OTHER_NETWORK: "ब्रिज {{network}} पर काम करता है।",
  PAUSED_ALL: "आपने पैसे की सारी आवाजाही रोक दी है। जारी रखने के लिए सेटिंग्स में फिर शुरू करें।",
  SIGN_IN_REQUIRED: "ब्रिज के लिए साइन इन करें।",
  WALLET_NOT_READY: "पहले अपना वॉलेट सेट करें।",
  WALLET_NOT_SET_UP: "पहले इस नेटवर्क पर अपना वॉलेट सेट करें।",
  DESTINATION_MISSING: "किस चेन पर?",
  AMOUNT_MISSING: "कितना?",
  AMOUNT_INVALID: "यह राशि मान्य नहीं है।",
  INSUFFICIENT_BALANCE: "USDC कम है। आपके पास {{balance}} है।",
  INSUFFICIENT_GAS: "नेटवर्क शुल्क के लिए Arc पर लगभग {{needed}} रखें।",
  AMOUNT_BELOW_FEE: "यह रूट शुल्क ({{fee}} तक) से कम है। ज़्यादा भेजें।",
  QUOTE_UNAVAILABLE: "अभी कोई रूट नहीं।",
};
