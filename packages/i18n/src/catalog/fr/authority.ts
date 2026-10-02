import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "Kawase peut",
  never: "Kawase ne peut jamais",
  worst: "Dans le pire des cas",
  canSendDaily: "Envoyer jusqu'à {{amount}} par jour depuis votre portefeuille",
  canSendPeriod: "Envoyer jusqu'à {{amount}} par période depuis votre portefeuille",
  canNoPrompt: "Le faire sans vous demander à chaque fois",
  neverMore: "Envoyer plus de {{amount}} en une journée",
  neverOtherTokens: "Toucher un autre jeton ou un autre contrat",
  neverLimits: "Modifier vos limites ou cette autorisation",
  worstCase:
    "Si tout tournait mal, {{amount}} au plus pourraient partir en une journée, et vous pouvez tout couper à tout moment.",
  meta: "{{network}} · jusqu'au {{date}}",
  unknownTerms: "Cette autorisation contient des conditions que Kawase ne sait pas lire. Ne vous fiez pas à ce résumé.",
};
