export const notify = {
  testnet: "Testnet",
  receivedTitle: "Received {{amount}}",
  receivedBody: "From {{name}}",
  requestPaidTitle: "Your request was paid",
  requestPaidBody: "{{amount}} from {{name}}",
  sentTitle: "Sent {{amount}}",
  sentBody: "To {{name}}",
  skippedTitle: "An automation was skipped",
  skippedBody: "Nothing was sent. Open Kawase to see why.",
  emailOpen: "Open Kawase",
  emailNeverApprove: "Kawase never asks you to approve or sign anything by email.",
  emailWhy: "You get this because it's on in Kawase. Change it in Settings → Notifications.",
} as const;
