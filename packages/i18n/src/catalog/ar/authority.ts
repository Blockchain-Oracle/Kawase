import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "يستطيع Kawase",
  never: "لا يستطيع Kawase أبدًا",
  worst: "في أسوأ الأحوال",
  canSendDaily: "أن يرسل حتى {{amount}} يوميًا من محفظتك",
  canSendPeriod: "أن يرسل حتى {{amount}} في كل فترة من محفظتك",
  canNoPrompt: "أن يفعل ذلك دون أن يسألك كل مرة",
  neverMore: "أن يرسل أكثر من {{amount}} في يوم واحد",
  neverOtherTokens: "أن يمسّ أي رمز أو عقد آخر",
  neverLimits: "أن يغيّر حدودك أو هذا الإذن",
  worstCase: "حتى لو ساء كل شيء، لا يمكن أن يخرج أكثر من {{amount}} في يوم واحد، ويمكنك الإيقاف في أي وقت.",
  meta: "‏{{network}} · حتى {{date}}",
  unknownTerms: "يتضمّن هذا الإذن شروطًا لا يستطيع Kawase قراءتها. لا تعتمد على هذا الملخّص.",
};
