// Builds the app's WalletSigner from Turnkey's hooks. `approval: 'passkey'` makes that one signature show
// the system passkey sheet (Face ID); `session` signs silently with the device's session key.
import { StamperType, useTurnkey } from "@turnkey/react-native-wallet-kit";
import { turnkeySigner, type ApprovalStrength, type WalletSigner } from "@kawase/wallet";
import type { Address, Hex } from "viem";

const ETHEREUM_FORMAT = "ADDRESS_FORMAT_ETHEREUM";
const HEX_PREFIX = "0x";

export function useTurnkeyWalletSigner(approval: ApprovalStrength = "session"): WalletSigner | undefined {
  const { wallets, httpClient, signTransaction } = useTurnkey();
  const account = wallets
    .flatMap((wallet) => wallet.accounts)
    .find((candidate) => candidate.addressFormat === ETHEREUM_FORMAT);
  if (!account || !httpClient) return undefined;
  const stamper = (strength: ApprovalStrength) => (strength === "passkey" ? StamperType.Passkey : undefined);

  return turnkeySigner({
    address: account.address as Address,
    approval,
    async signRawPayload({ payload, encoding, approval: strength }) {
      const response = await httpClient.signRawPayload(
        { signWith: account.address, payload, encoding, hashFunction: "HASH_FUNCTION_NO_OP" },
        stamper(strength),
      );
      const result = response.activity.result.signRawPayloadResult;
      if (!result) throw new Error("The wallet returned no signature");
      return { r: result.r, s: result.s, v: result.v };
    },
    async signTransaction({ unsignedTransaction, approval: strength }) {
      const strengthStamper = stamper(strength);
      const signed = await signTransaction({
        walletAccount: account,
        unsignedTransaction: unsignedTransaction.slice(HEX_PREFIX.length),
        transactionType: "TRANSACTION_TYPE_ETHEREUM",
        ...(strengthStamper ? { stampWith: strengthStamper } : {}),
      });
      return (signed.startsWith(HEX_PREFIX) ? signed : `${HEX_PREFIX}${signed}`) as Hex;
    },
  });
}
