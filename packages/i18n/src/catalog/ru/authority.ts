import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "Kawase может",
  never: "Kawase никогда не сможет",
  worst: "В худшем случае",
  canSendDaily: "Отправлять до {{amount}} в день с вашего кошелька",
  canSendPeriod: "Отправлять до {{amount}} за период с вашего кошелька",
  canNoPrompt: "Делать это, не спрашивая вас каждый раз",
  neverMore: "Отправить больше {{amount}} за день",
  neverOtherTokens: "Трогать другие токены или контракты",
  neverLimits: "Менять ваши лимиты или это разрешение",
  worstCase:
    "Если всё пойдёт не так, за день может уйти не больше {{amount}} — и вы можете отключить это в любой момент.",
  meta: "{{network}} · до {{date}}",
  unknownTerms: "В этом разрешении есть условия, которые Kawase не может прочитать. Не полагайтесь на это описание.",
};
