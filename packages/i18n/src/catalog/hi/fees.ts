import type { Catalog } from "../en/index";

export const fees: Catalog["fees"] = {
  actionsLeft: "~{{n}} काम बाकी",
  noneLeft: "शुल्क के लिए USDC नहीं",
  explain: "Arc पर नेटवर्क शुल्क USDC में लगता है, इसलिए आपका USDC अब कितनी बार भेजने का शुल्क दे सकता है, यह वह संख्या है। खत्म होने पर USDC और EURC भेजने का शुल्क Kawase देता है।",
  cardTitle: "शुल्क",
  perTransfer: "एक बार भेजने का खर्च लगभग {{amount}}",
  relayer: "अगर आपका वॉलेट शुल्क नहीं चुका सकता, तो USDC और EURC भेजने का शुल्क Kawase देता है।",
  loading: "आपका शुल्क रिज़र्व देखा जा रहा है…",
};
