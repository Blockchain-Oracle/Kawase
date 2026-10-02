export const pay = {
  pay: "Pay {{amount}}",
  signInToPay: "Sign in to pay",
  otherWallet: "Pay from another wallet",
  otherWalletBody:
    "Send exactly {{amount}} on {{network}} to this address. The request is marked paid when it arrives.",
  ownRequest: "This is your own request. Share the link with whoever should pay.",
  paidTitle: "Already paid",
  paidBody: "This request has been paid. Nothing more to do.",
  canceledTitle: "Request cancelled",
  canceledBody: "{{name}} cancelled this request. Nothing to pay.",
  expiredTitle: "Request expired",
  expiredBody: "This link is no longer open. Ask {{name}} for a new one.",
  notFoundTitle: "Request not found",
  notFoundBody: "Check the link, or ask for a new one.",
  loadFailed: "Couldn't load this request.",
} as const;
