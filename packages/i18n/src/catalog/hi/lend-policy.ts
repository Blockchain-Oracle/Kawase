import type { Catalog } from "../en/index";

export const lendPolicy: Catalog["lendPolicy"] = {
  SIGN_IN_REQUIRED: "Aave पर उधार लेने और कमाने के लिए साइन इन करें।",
  ON_OTHER_NETWORK: "Aave V4 {{network}} पर चलता है।",
  NOT_AVAILABLE_YET: "उधार अभी उपलब्ध नहीं है।",
  PAUSED_ALL: "आपने पैसे की सारी आवाजाही रोक दी है। जारी रखने के लिए सेटिंग्स में फिर से शुरू करें।",
  WALLET_NOT_READY: "पहले अपना वॉलेट सेट करें।",
  WALLET_NOT_SET_UP: "पहले इस नेटवर्क पर अपना वॉलेट सेट करें।",
  ASSET_UNCLEAR: "कौन सा एसेट?",
  LEND_ASSET_UNAVAILABLE: "Aave V4 यहाँ इसके लिए {{asset}} नहीं देता।",
  LEND_NOT_COLLATERAL: "{{asset}} यहाँ गारंटी के रूप में स्वीकार नहीं है। cirBTC, WETH और USDC स्वीकार हैं।",
  LEND_NOTHING_OWED: "आप पर कोई {{asset}} बकाया नहीं है।",
  AMOUNT_MISSING: "कितना?",
  AMOUNT_INVALID: "यह राशि मान्य नहीं है।",
  INSUFFICIENT_BALANCE: "{{asset}} काफ़ी नहीं है। आपके पास {{balance}} है।",
  OVER_POSITION: "Aave में आपके {{position}} हैं।",
  INSUFFICIENT_GAS: "नेटवर्क फ़ीस के लिए थोड़ा USDC रखें।",
  HEALTH_TOO_LOW: "इससे हेल्थ {{health}} हो जाएगी। Kawase इसे {{min}} से ऊपर रखता है: कम उधार लें या ज़्यादा रखें।",
  HEALTH_NEAR_LIMIT: "हेल्थ {{health}} होगी, सीमा के पास। कीमत में थोड़ी गिरावट इसे जोखिम में डाल सकती है।",
  fixSwitch: "Arc पर जाएँ",
};
