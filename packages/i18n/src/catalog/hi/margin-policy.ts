import type { Catalog } from "../en/index";

export const marginPolicy: Catalog["marginPolicy"] = {
  SIGN_IN_REQUIRED: "ट्रेड के लिए साइन इन करें।",
  ON_OTHER_NETWORK: "लॉन्ग और शॉर्ट {{network}} पर चलते हैं।",
  NOT_AVAILABLE_YET: "लॉन्ग और शॉर्ट अभी उपलब्ध नहीं हैं।",
  PAUSED_ALL: "आपने सारा पैसा आना-जाना रोक दिया है। जारी रखने के लिए सेटिंग्स में फिर से शुरू करें।",
  WALLET_NOT_READY: "पहले अपना वॉलेट सेट करें।",
  WALLET_NOT_SET_UP: "पहले इस नेटवर्क पर अपना वॉलेट सेट करें।",
  MARKET_MISSING: "कौन सा बाज़ार?",
  SIDE_MISSING: "लॉन्ग या शॉर्ट?",
  MARGIN_MARKET_UNAVAILABLE:
    "कोई लेंडिंग बाज़ार {{market}} को सूचीबद्ध नहीं करता, इसलिए यहाँ इस पर लॉन्ग या शॉर्ट नहीं हो सकता। इसे खरीदें, या कीमत अलर्ट लगाएँ।",
  MARGIN_SIDE_UNAVAILABLE: "{{market}} यहाँ {{side}} नहीं हो सकता। इस पर लॉन्ग एक सामान्य खरीद है।",
  POSITION_MISSING: "ऐसी कोई खुली पोज़िशन नहीं।",
  AMOUNT_MISSING: "कितना मार्जिन?",
  AMOUNT_INVALID: "यह राशि मान्य नहीं है।",
  INSUFFICIENT_BALANCE: "USDC काफ़ी नहीं। आपके पास {{balance}} हैं।",
  INSUFFICIENT_GAS: "नेटवर्क शुल्क के लिए लगभग {{needed}} रखें।",
  LEVERAGE_TOO_HIGH: "यह बाज़ार {{max}}× तक देता है।",
  QUOTE_UNAVAILABLE: "अभी कोई कीमत नहीं।",
  MARGIN_RISK: "लीवरेज से आपका पूरा मार्जिन जा सकता है।",
  fixTryAgain: "फिर कोशिश करें",
  fixSwitch: "Arc पर जाएँ",
  BRAKE_LEVERAGE: "{{leverage}}× पाँच गुना से ऊपर है: आपके ख़िलाफ़ छोटी-सी चाल मार्जिन मिटा सकती है।",
};
