import type { Catalog } from "../en/index";

export const receive: Catalog["receive"] = {
  title: "प्राप्त करें",
  warning: "सिर्फ़ Arc पर USDC और EURC। दूसरे नेटवर्क पर भेजा पैसा Kawase को नहीं दिखता।",
  copy: "पता कॉपी करें",
  share: "साझा करें",
  network: "नेटवर्क",
  shareMessage: "{{network}} पर मेरा Kawase पता: {{address}}",
  noWallet: "पता पाने के लिए साइन इन करें",
  noWalletBody: "आपका पता आपके खाते के साथ बनता है।",
  setUpFirst: "पहले अपना वॉलेट सेट करें",
  setUpFirstBody: "एक कदम, और आपका पता पैसे लेने को तैयार।",
};
