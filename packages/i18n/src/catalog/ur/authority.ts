import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "‏Kawase کر سکتا ہے",
  never: "‏Kawase کبھی نہیں کر سکتا",
  worst: "بدترین صورت",
  canSendDaily: "آپ کے والیٹ سے روزانہ {{amount}} تک بھیجنا",
  canSendPeriod: "آپ کے والیٹ سے ہر مدت میں {{amount}} تک بھیجنا",
  canNoPrompt: "ہر بار آپ سے پوچھے بغیر",
  neverMore: "ایک دن میں {{amount}} سے زیادہ بھیجنا",
  neverOtherTokens: "کسی دوسرے ٹوکن یا کنٹریکٹ کو چھونا",
  neverLimits: "آپ کی حدیں یا یہ اجازت بدلنا",
  worstCase:
    "اگر سب کچھ غلط ہو جائے تب بھی ایک دن میں زیادہ سے زیادہ {{amount}} ہی جا سکتا ہے، اور آپ کسی بھی وقت بند کر سکتے ہیں۔",
  meta: "‏{{network}} · {{date}} تک",
  unknownTerms: "اس اجازت میں ایسی شرائط ہیں جو Kawase پڑھ نہیں سکتا۔ اس خلاصے پر بھروسا نہ کریں۔",
};
