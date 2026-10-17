import type { Catalog } from "../en/index";

export const voiceSettings: Catalog["voiceSettings"] = {
  title: "Голос",
  subtitle: "Как звучит Kawase при общении с ним на телефоне и в веб-версии.",
  voiceTitle: "Голос Kawase",
  play: "Послушать {{name}}",
  stop: "Остановить",
  pickerHint: "Листайте, чтобы послушать каждый голос. Голос, на котором вы остановитесь, станет голосом Kawase.",
  previous: "Предыдущий голос",
  next: "Следующий голос",
  position: "{{name}}, {{index}} из {{count}}",
  selected: "Выбран",
  voiceMarin: "Звонкий и бодрый",
  voiceBeacon: "Тёплый и ровный",
  voiceCinder: "Выразительный и неспешный",
  voiceStone: "Глубокий и прямой",
  voiceVesper: "Низкий и спокойный",
  speedTitle: "Скорость речи",
  speedRelaxed: "Медленно",
  speedNormal: "Обычно",
  speedBrisk: "Быстро",
  autoSpeakTitle: "Kawase говорит первым",
  autoSpeakBody:
    "Приветствует вас сразу после открытия голосового режима. Если выключить, он будет ждать, пока вы заговорите.",
  note: "Изменения применятся при следующем разговоре с Kawase.",
  saveFailed: "Не удалось сохранить. Повторите попытку.",
};
