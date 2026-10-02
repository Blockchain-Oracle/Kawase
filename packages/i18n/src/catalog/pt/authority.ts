import type { Catalog } from "../en/index";

export const authority: Catalog["authority"] = {
  can: "O Kawase pode",
  never: "O Kawase nunca pode",
  worst: "No pior caso",
  canSendDaily: "Enviar até {{amount}} por dia da sua carteira",
  canSendPeriod: "Enviar até {{amount}} por período da sua carteira",
  canNoPrompt: "Fazer isso sem perguntar a cada vez",
  neverMore: "Enviar mais de {{amount}} em um dia",
  neverOtherTokens: "Mexer em qualquer outro token ou contrato",
  neverLimits: "Mudar seus limites ou esta permissão",
  worstCase:
    "Se tudo desse errado, no máximo {{amount}} poderiam sair em um dia — e você pode desligar a qualquer momento.",
  meta: "{{network}} · até {{date}}",
  unknownTerms: "Esta permissão tem condições que o Kawase não consegue ler. Não confie neste resumo.",
};
