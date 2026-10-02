export const deleteAccount = {
  title: "Delete account",
  body: "Your wallet stays yours. Kawase deletes what it keeps about you: contacts, conversations, inbox and settings.",
  holdings: "What your account holds",
  agentWallet: "Agent wallet: {{amount}} (returned to your wallet first)",
  revoke: "Turn off what Kawase may do",
  revokeOn: "Revoke on {{network}} ({{count}})",
  revokePrompt: "Revoke Kawase's permissions",
  revoked: "Revoked on chain",
  revokeFailed: "Revoking didn't finish. Try again.",
  noGrants: "Nothing to revoke.",
  revokeNote:
    "Revoking needs a little USDC for the fee, so do it before you move your money. Anything not revoked can't be used once the account is deleted.",
  takeOut: "Take your money out",
  takeOutBody:
    "Send it somewhere else, or export the wallet to use it in another app. You can also leave it: the wallet stays yours.",
  send: "Send",
  confirm: "Type {{handle}} to confirm",
  delete: "Delete my account",
  done: "Your account is deleted",
  failed: "Deleting didn't work. Nothing was deleted.",
  after:
    "Your @handle is held for 30 days so no one else can take it. Signing in again later starts a new account with the same wallet.",
} as const;
