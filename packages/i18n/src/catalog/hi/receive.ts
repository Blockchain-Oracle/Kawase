import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "प्राप्त करें",
  warning: "सिर्फ़ Arc पर USDC और EURC। दूसरे नेटवर्क पर भेजा पैसा Kawase को नहीं दिखता।",
  copy: "पता कॉपी करें",
  share: "साझा करें",
  network: "नेटवर्क",
  shareMessage: "{{network}} पर मेरा Kawase पता: {{address}}",
  otherChains: "Base, Ethereum और दूसरी चेन",
  otherChainsBody: "वहाँ यही पता चलता है; फिर Arc पर लाएँ।",
  askAmount: "राशि माँगें",
  askAsset: "एसेट",
  askShow: "कोड दिखाएँ",
  askHint: "इसे स्कैन करने वाला कोई भी वॉलेट {{network}} पर {{amount}} भर देगा।",
  askClear: "राशि हटाएँ",
  shareAsk: "मुझे {{network}} पर {{amount}} भेजें: {{address}}\n{{uri}}",
  noWallet: "पता पाने के लिए साइन इन करें",
  noWalletBody: "आपका पता आपके खाते के साथ बनता है।",
  setUpFirst: "पहले अपना वॉलेट सेट करें",
  setUpFirstBody: "एक कदम, और आपका पता पैसे लेने को तैयार।",
  anyToken:
    "Arc पर कोई भी टोकन यहाँ आता है। दूसरी चेन पर भेजा गया? वह वहाँ इसी पते पर पहुँचता है: “पैसे जोड़ें” से उसे Arc पर लाएँ।",
};
