import type { Catalog } from "../en/index";

export const pay: Catalog["pay"] = {
  pay: "{{amount}} चुकाएँ",
  signInToPay: "भुगतान के लिए साइन इन करें",
  otherWallet: "दूसरे वॉलेट से भुगतान करें",
  otherWalletBody: "{{network}} पर इस पते पर ठीक {{amount}} भेजें। पहुँचते ही अनुरोध भुगतान-पूर्ण दिखेगा।",
  ownRequest: "यह आपका अपना अनुरोध है। लिंक उन्हें भेजें जिन्हें भुगतान करना है।",
  paidTitle: "भुगतान हो चुका है",
  paidBody: "इस अनुरोध का भुगतान हो चुका है। और कुछ नहीं करना।",
  canceledTitle: "अनुरोध रद्द हुआ",
  canceledBody: "{{name}} ने यह अनुरोध रद्द कर दिया। कुछ नहीं चुकाना।",
  expiredTitle: "अनुरोध की अवधि समाप्त",
  expiredBody: "यह लिंक अब खुला नहीं है। {{name}} से नया लिंक माँगें।",
  notFoundTitle: "अनुरोध नहीं मिला",
  notFoundBody: "लिंक जाँचें, या नया लिंक माँगें।",
  loadFailed: "यह अनुरोध लोड नहीं हो सका।",
};
