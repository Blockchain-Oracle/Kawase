import type { Catalog } from "../en/index";

export const forYou: Catalog["forYou"] = {
  title: "आपके लिए",
  loading: "देख रहा है कि किस पर ध्यान चाहिए…",
  nothing: "अभी किसी चीज़ पर आपका ध्यान नहीं चाहिए।",
  hide: "छिपाएँ",
  hideThis: "इसे छिपाएँ",
  muteKind: "इस तरह का न दिखाएँ",
  showAgain: "छिपे हुए प्रकार फिर दिखाएँ ({{count}})",
  idleTitle: "{{amount}} USDC बेकार पड़ा है",
  idleBody:
    "{{vault}} अभी लगभग {{apy}}% सालाना देता है और पूरा पैसा तुरंत लौटा सकता है। {{keep}} USDC खर्च के लिए तैयार रहेगा।",
  idleAction: "काम पर लगाएँ",
  idlePrompt: "{{amount}} USDC को {{vault}} में काम पर लगाओ और मेरे वॉलेट में {{keep}} USDC रखो।",
  requestTitle: "आपका {{amount}} {{asset}} का अनुरोध जल्द खत्म होगा",
  requestBody: "भुगतान के लिए लगभग {{hours}} घंटे बचे हैं। लिंक फिर से शेयर करें?",
  requestAction: "लिंक शेयर करें",
  bridgeTitle: "{{chain}} पर आपका ब्रिज देर ले रहा है",
  bridgeBody: "{{minutes}} मिनट हो गए; आमतौर पर लगभग एक मिनट लगता है। देखें यह कहाँ है।",
  bridgeAction: "देखें",
  healthTitle: "आपकी {{market}} {{side}} लिक्विडेशन के करीब है",
  healthBody:
    "हेल्थ {{health}}; कीमत आपके ख़िलाफ़ {{distance}} चली तो लिक्विडेशन। मार्जिन जोड़ने या कुछ हिस्सा बंद करने से सुरक्षित रहेगी।",
  healthAction: "देखें",
  healthPrompt: "मेरी {{market}} {{side}} की हेल्थ {{health}} है। मेरे पास क्या विकल्प हैं?",
  moveTitle: "{{asset}} आज {{change}} बदला",
  moveBody: "आपका {{held}} {{asset}} डॉलर में {{valueChange}} है (अभी {{price}} प्रति यूनिट)।",
  moveAction: "वजह पूछें",
  movePrompt: "{{asset}} आज {{change}} क्यों बदला, और मेरे {{held}} {{asset}} के लिए इसका क्या मतलब है?",
};
