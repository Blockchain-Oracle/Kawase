// What a Privy web export bundles in place of @turnkey/react-wallet-kit (metro.config.js): Turnkey's web kit with its
// FontAwesome icon sets was ~3.5 MB of the first load, and a Privy build never renders Turnkey's provider or calls its
// hooks (they would throw outside the provider anyway). The names the app imports exist so the modules load; anything
// actually used says so loudly.
const absent = () => {
  throw new Error("Turnkey is not part of this build (EXPO_PUBLIC_WALLET_PROVIDER=privy)");
};

export const OtpType = { Email: "OTP_TYPE_EMAIL", Sms: "OTP_TYPE_SMS" };
export const StamperType = { ApiKey: "api-key", Passkey: "passkey", Wallet: "wallet" };

export function TurnkeyProvider({ children }) {
  return children;
}

export function useTurnkey() {
  return new Proxy({}, { get: (_target, key) => (key === "then" ? undefined : absent) });
}
