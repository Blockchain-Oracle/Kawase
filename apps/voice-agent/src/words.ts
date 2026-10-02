// What the worker itself says, per language (everything else is Kawase's agent, in the person's language).
import type { SupportedLocale } from "@kawase/config";

/** The first thing the person hears in the fallback pipeline, in their language: the session is live. */
export const GREETING: Record<SupportedLocale, string> = {
  en: "Hi, I'm listening.",
  es: "Hola, te escucho.",
  fr: "Bonjour, je vous écoute.",
  pt: "Oi, estou ouvindo.",
  ru: "Привет, я слушаю.",
  zh: "你好，我在听。",
  hi: "नमस्ते, मैं सुन रहा हूँ।",
  bn: "নমস্কার, আমি শুনছি।",
  ar: "مرحباً، أنا أستمع.",
  ur: "سلام، میں سن رہا ہوں۔",
};

/** Said while the agent checks something (fallback pipeline only; GPT-Live paces itself). */
export const FILLER: Record<SupportedLocale, string> = {
  en: "One moment. ",
  es: "Un momento. ",
  fr: "Un instant. ",
  pt: "Só um momento. ",
  ru: "Минутку. ",
  zh: "稍等一下。",
  hi: "एक पल। ",
  bn: "এক মুহূর্ত। ",
  ar: "لحظة واحدة. ",
  ur: "ایک لمحہ۔ ",
};

/** Said when a turn ends without an answer (the api or the model failed): never silence. */
export const SORRY: Record<SupportedLocale, string> = {
  en: "Sorry, I couldn't do that just now. Please try again.",
  es: "Lo siento, no pude hacerlo ahora. Inténtalo de nuevo.",
  fr: "Désolé, je n'ai pas pu le faire. Réessayez.",
  pt: "Desculpe, não consegui agora. Tente de novo.",
  ru: "Извините, сейчас не получилось. Попробуйте ещё раз.",
  zh: "抱歉，刚才没能完成，请再试一次。",
  hi: "माफ़ कीजिए, अभी नहीं हो पाया। फिर से कोशिश करें।",
  bn: "দুঃখিত, এখন করতে পারিনি। আবার চেষ্টা করুন।",
  ar: "عذراً، لم أتمكن من ذلك الآن. حاول مرة أخرى.",
  ur: "معذرت، ابھی نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
};

/** Language names for GPT-Live's English persona. */
export const LANGUAGE_IN_ENGLISH: Record<SupportedLocale, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Mandarin Chinese",
  hi: "Hindi",
  bn: "Bengali",
  ar: "Arabic",
  ur: "Urdu",
};
