import type { Catalog } from "../en/index";

export const forYou: Catalog["forYou"] = {
  title: "آپ کے لیے",
  loading: "دیکھ رہا ہے کہ کس چیز پر توجہ چاہیے…",
  nothing: "ابھی کسی چیز پر آپ کی توجہ نہیں چاہیے۔",
  hide: "چھپائیں",
  hideThis: "اسے چھپائیں",
  muteKind: "اس قسم کو نہ دکھائیں",
  showAgain: "چھپی ہوئی اقسام دوبارہ دکھائیں ({{count}})",
  idleTitle: "{{amount}} USDC بے کار پڑے ہیں",
  idleBody:
    "{{vault}} ابھی تقریباً {{apy}}% سالانہ دیتا ہے اور پوری رقم فوراً واپس کر سکتا ہے۔ {{keep}} USDC خرچ کے لیے تیار رہیں گے۔",
  idleAction: "کام پر لگائیں",
  idlePrompt: "{{amount}} USDC کو {{vault}} میں کام پر لگاؤ اور میرے والٹ میں {{keep}} USDC رکھو۔",
  requestTitle: "آپ کی {{amount}} {{asset}} کی درخواست جلد ختم ہو گی",
  requestBody: "ادائیگی کے لیے تقریباً {{hours}} گھنٹے باقی ہیں۔ لنک دوبارہ شیئر کریں؟",
  requestAction: "لنک شیئر کریں",
  bridgeTitle: "{{chain}} پر آپ کا برج دیر لگا رہا ہے",
  bridgeBody: "{{minutes}} منٹ ہو گئے؛ عام طور پر تقریباً ایک منٹ میں پہنچتا ہے۔ دیکھیں کہاں ہے۔",
  bridgeAction: "دیکھیں",
  healthTitle: "آپ کی {{market}} {{side}} لیکویڈیشن کے قریب ہے",
  healthBody:
    "صحت {{health}}؛ قیمت آپ کے خلاف {{distance}} چلی تو لیکویڈیشن۔ مارجن بڑھانے یا کچھ حصہ بند کرنے سے محفوظ رہے گی۔",
  healthAction: "جائزہ لیں",
  healthPrompt: "میری {{market}} {{side}} کی صحت {{health}} ہے۔ میرے پاس کیا راستے ہیں؟",
  moveTitle: "{{asset}} آج {{change}} بدلا",
  moveBody: "آپ کے {{held}} {{asset}} ڈالر میں {{valueChange}} ہیں (ابھی {{price}} فی یونٹ)۔",
  moveAction: "وجہ پوچھیں",
  movePrompt: "{{asset}} آج {{change}} کیوں بدلا، اور میرے {{held}} {{asset}} کے لیے اس کا کیا مطلب ہے؟",
};
