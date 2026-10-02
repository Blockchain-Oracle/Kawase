export const earnPolicy = {
  NOT_AVAILABLE_YET: "Earning isn't available on this network yet.",
  ON_OTHER_NETWORK: "Earning works on {{network}}.",
  PAUSED_ALL: "You paused all money movement. Resume it in Settings to continue.",
  SIGN_IN_REQUIRED: "Sign in to earn.",
  WALLET_NOT_READY: "Set up your wallet first.",
  WALLET_NOT_SET_UP: "Set up your wallet on this network first.",
  VAULT_UNAVAILABLE: "This vault isn't available here.",
  AMOUNT_MISSING: "How much?",
  AMOUNT_INVALID: "That amount isn't valid.",
  INSUFFICIENT_BALANCE: "Not enough USDC. You have {{balance}}.",
  INSUFFICIENT_GAS: "Keep about {{needed}} for the network fee.",
  OVER_POSITION: "That's more than you have in this vault ({{position}}).",
  VAULT_LIQUIDITY_SHORT: "The vault can pay out only {{available}} right now; the rest is lent out. Try less or later.",
  VAULT_LOW_LIQUIDITY: "Low liquidity: withdrawals may have to wait",
  VAULT_RISK_WARNING: "App Kit flags this vault: {{warnings}}",
  VAULT_LIQUIDITY_STUCK:
    "This vault can pay out only {{available}} right now, so Kawase won't put money in. Pick a liquid one.",
} as const;
