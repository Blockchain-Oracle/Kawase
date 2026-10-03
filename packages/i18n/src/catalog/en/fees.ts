export const fees = {
  actionsLeft: "~{{n}} actions left",
  noneLeft: "No USDC for fees",
  explain:
    "Network fees on Arc are paid in USDC, so this is how many sends your USDC can still pay for. When it runs out, Kawase pays the fee for your USDC and EURC sends.",
  cardTitle: "Fees",
  perTransfer: "One send costs about {{amount}}",
  relayer: "If your wallet can't pay a fee, Kawase pays it for USDC and EURC sends.",
  loading: "Checking your fee reserve…",
} as const;
