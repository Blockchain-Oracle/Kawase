export const authority = {
  can: "Kawase can",
  never: "Kawase can never",
  worst: "Worst case",
  canSendDaily: "Send up to {{amount}} a day from your wallet",
  canSendPeriod: "Send up to {{amount}} each period from your wallet",
  canNoPrompt: "Do it without asking you each time",
  neverMore: "Send more than {{amount}} in a day",
  neverOtherTokens: "Touch any other token or contract",
  neverLimits: "Change your limits or this permission",
  worstCase:
    "If everything went wrong, at most {{amount}} could leave in one day — and you can switch it off at any time.",
  meta: "{{network}} · until {{date}}",
  unknownTerms: "This permission has terms Kawase cannot read. Do not rely on this summary.",
} as const;
