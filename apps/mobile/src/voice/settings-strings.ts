// Settings → Voice strings in the ten languages (English written here, the rest translated with gpt-5.6-luna on
// 2026-10-02). They are added to i18next at runtime under "voiceSettings" without overwriting: when they move into the
// shared catalogs (packages/i18n, owned by the lead), the catalogs' wording wins and this file can go.
import i18next from "i18next";

import type { SupportedLocale } from "@kawase/config";

const STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Voice",
    subtitle: "How Kawase sounds when you talk to it, on your phone and on the web.",
    voiceTitle: "Kawase's voice",
    speedTitle: "Speaking speed",
    speedRelaxed: "Relaxed",
    speedNormal: "Normal",
    speedBrisk: "Brisk",
    autoSpeakTitle: "Kawase speaks first",
    autoSpeakBody: "Says hello as soon as voice opens. Off: it waits for you to speak.",
    note: "Changes apply the next time you start talking to Kawase.",
    saveFailed: "Couldn't save that. Try again.",
  },
  zh: {
    title: "语音",
    subtitle: "Kawase 在手机和网页上与你交谈时的声音。",
    voiceTitle: "Kawase 的声音",
    speedTitle: "语速",
    speedRelaxed: "舒缓",
    speedNormal: "正常",
    speedBrisk: "快速",
    autoSpeakTitle: "Kawase 主动开口",
    autoSpeakBody: "打开语音后立即向你问好。关闭后：等待你先说话。",
    note: "更改会在你下次开始与 Kawase 对话时生效。",
    saveFailed: "无法保存，请重试。",
  },
  hi: {
    title: "आवाज़",
    subtitle: "फ़ोन या वेब पर Kawase से बात करते समय उसकी आवाज़ कैसी सुनाई देगी।",
    voiceTitle: "Kawase की आवाज़",
    speedTitle: "बोलने की गति",
    speedRelaxed: "आराम से",
    speedNormal: "सामान्य",
    speedBrisk: "तेज़",
    autoSpeakTitle: "Kawase पहले बोलता है",
    autoSpeakBody: "वॉइस खुलते ही नमस्ते कहता है। बंद होने पर: यह आपके बोलने का इंतज़ार करता है।",
    note: "बदलाव अगली बार Kawase से बात शुरू करने पर लागू होंगे।",
    saveFailed: "इसे सेव नहीं कर सके। फिर कोशिश करें।",
  },
  es: {
    title: "Voz",
    subtitle: "Cómo suena Kawase cuando hablas con él, en el móvil y en la web.",
    voiceTitle: "Voz de Kawase",
    speedTitle: "Velocidad al hablar",
    speedRelaxed: "Tranquila",
    speedNormal: "Normal",
    speedBrisk: "Rápida",
    autoSpeakTitle: "Kawase habla primero",
    autoSpeakBody: "Saluda en cuanto abres el modo de voz. Desactivado: espera a que hables.",
    note: "Los cambios se aplicarán la próxima vez que hables con Kawase.",
    saveFailed: "No se ha podido guardar. Inténtalo de nuevo.",
  },
  fr: {
    title: "Voix",
    subtitle: "Définit la façon dont Kawase vous parle, sur votre téléphone et sur le web.",
    voiceTitle: "Voix de Kawase",
    speedTitle: "Vitesse de parole",
    speedRelaxed: "Posée",
    speedNormal: "Normale",
    speedBrisk: "Rapide",
    autoSpeakTitle: "Kawase parle en premier",
    autoSpeakBody: "Dit bonjour dès l’ouverture du mode vocal. Désactivé : attend que vous parliez.",
    note: "Les changements prendront effet la prochaine fois que vous parlerez à Kawase.",
    saveFailed: "Impossible d’enregistrer. Réessayez.",
  },
  ar: {
    title: "الصوت",
    subtitle: "كيفية تحدث Kawase إليك على هاتفك والويب.",
    voiceTitle: "صوت Kawase",
    speedTitle: "سرعة الكلام",
    speedRelaxed: "هادئة",
    speedNormal: "عادية",
    speedBrisk: "سريعة",
    autoSpeakTitle: "يتحدث Kawase أولًا",
    autoSpeakBody: "يقول مرحبًا بمجرد فتح وضع الصوت. عند إيقافه، ينتظر أن تتحدث.",
    note: "تسري التغييرات في المرة التالية التي تبدأ فيها التحدث إلى Kawase.",
    saveFailed: "تعذر حفظ ذلك. حاول مرة أخرى.",
  },
  bn: {
    title: "ভয়েস",
    subtitle: "ফোনে ও ওয়েবে আপনার সঙ্গে কথা বলার সময় Kawase কেমন শোনায়।",
    voiceTitle: "Kawase-এর কণ্ঠ",
    speedTitle: "কথার গতি",
    speedRelaxed: "স্বচ্ছন্দ",
    speedNormal: "স্বাভাবিক",
    speedBrisk: "দ্রুত",
    autoSpeakTitle: "Kawase আগে কথা বলে",
    autoSpeakBody: "ভয়েস চালু হলেই অভিবাদন জানায়। বন্ধ থাকলে আপনার কথা বলা পর্যন্ত অপেক্ষা করে।",
    note: "Kawase-এর সঙ্গে পরেরবার কথা বলা শুরু করলে পরিবর্তনগুলো প্রযোজ্য হবে।",
    saveFailed: "এটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
  },
  pt: {
    title: "Voz",
    subtitle: "Como o Kawase fala com você no celular e na web.",
    voiceTitle: "Voz do Kawase",
    speedTitle: "Velocidade da fala",
    speedRelaxed: "Calma",
    speedNormal: "Normal",
    speedBrisk: "Rápida",
    autoSpeakTitle: "Kawase fala primeiro",
    autoSpeakBody: "Diz olá assim que a voz é aberta. Desativado: espera você falar.",
    note: "As alterações valem na próxima vez que você começar a falar com o Kawase.",
    saveFailed: "Não foi possível salvar. Tente novamente.",
  },
  ru: {
    title: "Голос",
    subtitle: "Как звучит Kawase при общении с ним на телефоне и в веб-версии.",
    voiceTitle: "Голос Kawase",
    speedTitle: "Скорость речи",
    speedRelaxed: "Медленно",
    speedNormal: "Обычно",
    speedBrisk: "Быстро",
    autoSpeakTitle: "Kawase говорит первым",
    autoSpeakBody:
      "Приветствует вас сразу после открытия голосового режима. Если выключить, он будет ждать, пока вы заговорите.",
    note: "Изменения применятся при следующем разговоре с Kawase.",
    saveFailed: "Не удалось сохранить. Повторите попытку.",
  },
  ur: {
    title: "آواز",
    subtitle: "موبائل اور ویب پر Kawase آپ سے بات کرتے وقت کیسی آواز میں بولے۔",
    voiceTitle: "Kawase کی آواز",
    speedTitle: "بولنے کی رفتار",
    speedRelaxed: "آہستہ",
    speedNormal: "معمول",
    speedBrisk: "تیز",
    autoSpeakTitle: "Kawase پہلے بولے",
    autoSpeakBody: "وائس کھلتے ہی سلام کرتا ہے۔ بند ہونے پر، یہ آپ کے بولنے کا انتظار کرتا ہے۔",
    note: "تبدیلیاں اگلی بار Kawase سے بات شروع کرنے پر لاگو ہوں گی۔",
    saveFailed: "محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔",
  },
};

let registered = false;

/** Adds the strings once; the shared catalogs win wherever they already have a key. */
export function registerVoiceSettingsStrings() {
  if (registered) return;
  registered = true;
  for (const [locale, strings] of Object.entries(STRINGS))
    i18next.addResourceBundle(locale, "translation", { voiceSettings: strings }, true, false);
}
