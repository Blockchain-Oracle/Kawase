// The wallet setup sequence (journey 4), lifted from the old three-card wallet screen and made automatic: create
// and register the wallet → the relayed EIP-7702 setup on the active network → the daily allowance, which is the
// only step that waits for the person (one Face ID). Each step can fail on its own and be retried on its own.
import * as React from "react";
import type { TransactionSerializable, TypedDataDefinition } from "viem";

import type { GrantReceipt, NetworkId, UnsignedTransaction } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { PASSKEY_RP_ID } from "@/wallet/config";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";
import { useWalletSigner } from "@/wallet/use-wallet-signer";
import { useWalletStatus } from "@/wallet/use-wallet-status";

export type SetupStepKey = "wallet" | "setup" | "allowance";
export type AcceptResult = { status: "accepted"; receipt: GrantReceipt } | { status: "cancelled" } | { status: "failed" };

export function toSerializable(transaction: UnsignedTransaction): TransactionSerializable {
  return {
    type: "eip1559",
    chainId: transaction.chainId,
    nonce: transaction.nonce,
    to: transaction.to,
    data: transaction.data,
    value: BigInt(transaction.value),
    gas: BigInt(transaction.gas),
    maxFeePerGas: BigInt(transaction.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(transaction.maxPriorityFeePerGas),
  };
}

type Prompt = { message: string; cancel: string };

export function useWalletSetup(network: NetworkId) {
  const { status } = useSession();
  const turnkey = useTurnkeyAccount();
  // Passkeys need a real domain; until then the session key signs, behind the device's Face ID check.
  const signer = useWalletSigner(PASSKEY_RP_ID ? "passkey" : "session");
  const { wallet, refresh } = useWalletStatus();
  const [running, setRunning] = React.useState<SetupStepKey>();
  const [failed, setFailed] = React.useState<Partial<Record<SetupStepKey, true>>>({});

  const state = wallet?.networks[network];
  const hasWallet = Boolean(wallet?.address);
  const setUp = Boolean(state?.setUp);
  const loaded = status === "account" && wallet !== undefined;

  const step = React.useCallback(
    async (key: SetupStepKey, action: () => Promise<void>) => {
      setRunning(key);
      setFailed((current) => ({ ...current, [key]: undefined }));
      try {
        await action();
        await refresh();
      } catch {
        setFailed((current) => ({ ...current, [key]: true }));
      } finally {
        setRunning(undefined);
      }
    },
    [refresh],
  );

  const createWallet = React.useCallback(() => step("wallet", async () => void (await turnkey.ensureWallet())), [step, turnkey]);

  const setUpWallet = React.useCallback(
    () =>
      step("setup", async () => {
        if (!signer) throw new Error("no signer");
        const request = await api.wallet.setupRequest(network);
        if (request.alreadySetUp) return;
        const signed = await signer.signAuthorization(request.authorization);
        await api.wallet.setupSubmit(network, { address: signed.address, chainId: signed.chainId, nonce: signed.nonce, r: signed.r, s: signed.s, yParity: signed.yParity ?? 0 });
      }),
    [step, signer, network],
  );

  // The first two steps run by themselves, in order, as soon as what they need is there; a failed step waits
  // for its Retry instead of looping.
  React.useEffect(() => {
    if (!loaded || running) return;
    if (!hasWallet && !failed.wallet) void createWallet();
    else if (hasWallet && !setUp && signer && !failed.setup) void setUpWallet();
  }, [loaded, running, hasWallet, setUp, signer, failed.wallet, failed.setup, createWallet, setUpWallet]);

  /** One Face ID, then the allowance is signed and submitted; the receipt comes back decoded from the signed grant. */
  const acceptAllowance = React.useCallback(
    async (prompt: Prompt): Promise<AcceptResult> => {
      if (!signer) return { status: "failed" };
      const check = await confirmWithBiometrics(prompt.message, prompt.cancel);
      if (check === "cancelled") return { status: "cancelled" };
      setRunning("allowance");
      setFailed((current) => ({ ...current, allowance: undefined }));
      try {
        const request = await api.wallet.allowanceRequest(network);
        const signature = await signer.signTypedData(request.typedData as unknown as TypedDataDefinition);
        await api.wallet.allowanceSubmit(request.grantId, signature);
        await refresh();
        return { status: "accepted", receipt: request.receipt };
      } catch {
        setFailed((current) => ({ ...current, allowance: true }));
        return { status: "failed" };
      } finally {
        setRunning(undefined);
      }
    },
    [signer, network, refresh],
  );

  return {
    loaded,
    wallet,
    state,
    hasWallet,
    setUp,
    allowance: state?.allowance ?? null,
    running,
    failed,
    retry: { wallet: createWallet, setup: setUpWallet },
    acceptAllowance,
    refresh,
  };
}
