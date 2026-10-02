import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "Kawase कर सकता है",
  never: "Kawase कभी नहीं कर सकता",
  worst: "सबसे बुरी स्थिति",
  canSendDaily: "आपके वॉलेट से रोज़ {{amount}} तक भेजना",
  canSendPeriod: "आपके वॉलेट से हर अवधि में {{amount}} तक भेजना",
  canNoPrompt: "हर बार आपसे पूछे बिना",
  neverMore: "एक दिन में {{amount}} से ज़्यादा भेजना",
  neverOtherTokens: "किसी दूसरे टोकन या कॉन्ट्रैक्ट को छूना",
  neverLimits: "आपकी सीमाएँ या यह अनुमति बदलना",
  worstCase:
    "अगर सब कुछ ग़लत हो जाए, तब भी एक दिन में अधिकतम {{amount}} ही जा सकता है — और आप इसे कभी भी बंद कर सकते हैं।",
  meta: "{{network}} · {{date}} तक",
  unknownTerms: "इस अनुमति में ऐसी शर्तें हैं जिन्हें Kawase पढ़ नहीं सकता। इस सारांश पर भरोसा न करें।",
};
