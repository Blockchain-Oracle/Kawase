export const wallet = {
  title: "Wallet",
  creating: "Creating your wallet…",
  settingUp: "Setting up your wallet on {{network}}…",
  ready: "Your wallet is ready",
  address: "Address",
  balance: "Balance",
  noWallet: "Sign in to get a wallet",
  setupNeeded: "Set up on {{network}}",
  setUp: "Set up",
  allowanceTitle: "Daily allowance",
  allowanceBody: "Kawase can send up to {{amount}} a day for you without asking. Above that, you approve with Face ID.",
  allowanceBodyAndroid:
    "Kawase can send up to {{amount}} a day for you without asking. Above that, you approve with your fingerprint or screen lock.",
  allowanceAccept: "Accept",
  allowanceAcceptFaceId: "Accept with Face ID",
  allowanceActive: "On · {{amount}} a day",
  allowanceOff: "Off",
  allowanceRevoke: "Turn off",
  mainnetConsentTitle: "Real money",
  mainnetConsentBody:
    "Mainnet uses real USDC. Kawase moves it only within the limits you set, and never above your allowance without your Face ID.",
  mainnetConsentBodyWeb:
    "Mainnet uses real USDC. Kawase moves it only within the limits you set, and never above your allowance without your confirmation.",
  mainnetConsentBodyAndroid:
    "Mainnet uses real USDC. Kawase moves it only within the limits you set, and never above your allowance without your fingerprint or screen lock.",
  mainnetConsentAccept: "I understand",
  testnetMoney: "Test USDC has no value.",
} as const;
