// The wallet setup sequence (journey 4), lifted from the old three-card wallet screen and made automatic: create
// and register the wallet → the relayed EIP-7702 setup on the active network → the daily allowance, which is the
// only step that waits for the person (one Face ID). Each step can fail on its own and be retried on its own.
//
// The allowance is asked for before it is approved (Codex review R02): the api's proposal, decoded from its caveats,
// is what the person reads, and exactly that payload is signed; a proposal older than the approval window is asked
// for again and shown again instead of being signed. Only an explicit "approved" from the device check signs (R03).
import * as React from "react";
import type { TypedDataDefinition } from "viem";

import { ApiError, type AllowanceRequestResponse, type GrantReceipt, type NetworkId } from "@kawase/api-client";
import { APPROVAL_TTL_S, MS_PER_SECOND } from "@kawase/config";

import { checkTransferGrant } from "@kawase/wallet";

import { useT } from "@/i18n";
import { api } from "@/session/api";
import { reportClientEvent } from "@/session/client-events";
import { useSession } from "@/session/session-provider";
import { confirmWithBiometrics } from "@/wallet/biometric";
import { sayIfRefused } from "@/wallet/refused";
import { signRevoke } from "@/wallet/sign-revoke";
import { useWalletAccount } from "@/wallet/use-wallet-account";
import { useWalletSigner } from "@/wallet/use-wallet-signer";
import { useWalletStatus } from "@/wallet/use-wallet-status";

export type SetupStepKey = "wallet" | "setup" | "allowance";
export type AcceptResult =
  | { status: "accepted"; receipt: GrantReceipt }
  /** The proposal shown was too old; a fresh one is on screen now, to read and approve again. */
  | { status: "refreshed" }
  | { status: "cancelled" }
  /** The device has nothing to check with (no Face ID, Touch ID, fingerprint or passcode). */
  | { status: "unavailable" }
  /** The device check ran and did not match. */
  | { status: "biometricFailed" }
  | { status: "failed" };

/** The allowance the api proposes: what the person reads before approving, and exactly what is signed. */
export type AllowanceProposal = AllowanceRequestResponse & { fetchedAt: number };

/** How long the setup waits for the wallet to be able to sign before it says so with Retry. */
const SIGNER_WAIT_MS = 8_000;

/** A proposal older than this is asked for again before it can be signed. */
const PROPOSAL_MAX_AGE_MS = APPROVAL_TTL_S * MS_PER_SECOND;

export { toSerializable } from "@/wallet/serializable";

type Prompt = { message: string; cancel: string };

export function useWalletSetup(network: NetworkId) {
  const { t } = useT();
  const { status } = useSession();
  const account = useWalletAccount();
  // Passkeys need a real domain; until then the session key signs, behind the device's Face ID check.
  const signer = useWalletSigner();
  const { wallet, refresh, error: loadError } = useWalletStatus();
  const [running, setRunning] = React.useState<SetupStepKey>();
  const [failed, setFailed] = React.useState<Partial<Record<SetupStepKey, true>>>({});
  /** The network is on but Kawase's relayer there has no gas yet (first mainnet days): a calm wait, not an error. */
  const [notReady, setNotReady] = React.useState(false);
  /** The wallet exists but did not become able to sign in time: the step says so instead of waiting silently. */
  const [signerMissing, setSignerMissing] = React.useState(false);
  const [proposal, setProposal] = React.useState<AllowanceProposal>();
  const [preparing, setPreparing] = React.useState(false);
  const [proposalError, setProposalError] = React.useState(false);

  const state = wallet?.networks[network];
  const hasWallet = Boolean(wallet?.address);
  const setUp = Boolean(state?.setUp);
  const loaded = status === "account" && wallet !== undefined;
  const allowance = state?.allowance ?? null;

  const step = React.useCallback(
    async (key: SetupStepKey, action: () => Promise<void>) => {
      setRunning(key);
      setFailed((current) => ({ ...current, [key]: undefined }));
      try {
        await action();
        await refresh();
        setNotReady(false);
      } catch (error) {
        // No gas on the relayer yet, or its day's budget spent: the same calm wait, not an error.
        if (error instanceof ApiError && (error.code === "network_not_ready" || error.code === "relayer_budget_spent")) setNotReady(true);
        // The setup is signed only for the DeleGator on Arc; anything else is refused on the phone (M6).
        sayIfRefused(error, t);
        setFailed((current) => ({ ...current, [key]: true }));
      } finally {
        setRunning(undefined);
      }
    },
    [refresh, t],
  );

  const createWallet = React.useCallback(() => step("wallet", async () => void (await account.ensureWallet())), [step, account]);

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

  /** Step 2 is waiting for the wallet to be able to sign (the provider's wallet is still connecting). */
  const connecting = loaded && hasWallet && !setUp && !signer && !failed.setup;
  React.useEffect(() => {
    if (!connecting) return;
    const timer = setTimeout(() => {
      setSignerMissing(true);
      setFailed((current) => ({ ...current, setup: true }));
      reportClientEvent({ stage: "setup", category: "signerMissing", message: `network=${network}` });
    }, SIGNER_WAIT_MS);
    return () => clearTimeout(timer);
  }, [connecting, network]);
  React.useEffect(() => {
    if (signer) setSignerMissing(false);
  }, [signer]);

  /** Retry signs when the wallet can; otherwise it waits for the wallet to connect again. */
  const retrySetup = React.useCallback(async () => {
    if (signer) return setUpWallet();
    setSignerMissing(false);
    setFailed((current) => ({ ...current, setup: undefined }));
  }, [signer, setUpWallet]);

  /** Asks the api for the allowance it would grant, decoded from its caveats, for the person to read first. */
  const prepareAllowance = React.useCallback(async () => {
    setPreparing(true);
    setProposalError(false);
    try {
      const request = await api.wallet.allowanceRequest(network);
      setProposal({ ...request, fetchedAt: Date.now() });
    } catch {
      setProposalError(true);
    } finally {
      setPreparing(false);
    }
  }, [network]);

  // A proposal belongs to one network; switching drops it.
  React.useEffect(() => {
    setProposal(undefined);
    setProposalError(false);
  }, [network]);

  // Once the wallet is set up and no allowance is on, the proposal is fetched so it can be shown before the tap.
  React.useEffect(() => {
    if (loaded && hasWallet && setUp && !allowance && !proposal && !preparing && !proposalError) void prepareAllowance();
  }, [loaded, hasWallet, setUp, allowance, proposal, preparing, proposalError, prepareAllowance]);

  /** The device check, then exactly the proposal on screen is signed and submitted; the receipt is the accepted one. */
  const acceptAllowance = React.useCallback(
    async (prompt: Prompt): Promise<AcceptResult> => {
      if (!signer) return { status: "failed" };
      if (!proposal || Date.now() - proposal.fetchedAt > PROPOSAL_MAX_AGE_MS) {
        await prepareAllowance();
        return { status: "refreshed" };
      }
      const check = await confirmWithBiometrics(prompt.message, prompt.cancel);
      if (check === "cancelled") return { status: "cancelled" };
      if (check === "unavailable") return { status: "unavailable" };
      if (check !== "approved") return { status: "biometricFailed" };
      setRunning("allowance");
      setFailed((current) => ({ ...current, allowance: undefined }));
      try {
        // The card reads this receipt; the phone decodes the grant itself and signs only if the two agree (M6).
        checkTransferGrant(proposal.typedData, proposal.receipt, signer.address);
        const signature = await signer.signTypedData(proposal.typedData as unknown as TypedDataDefinition);
        // An allowance this one replaces is revoked in the same yes; the api turns it off on chain first.
        const revoke = proposal.revoke ? await signRevoke(signer, proposal.revoke) : undefined;
        const accepted = await api.wallet.allowanceSubmit(proposal.grantId, signature, revoke);
        // The status first, so the allowance is seen as on before the proposal is dropped (no needless re-request).
        await refresh();
        setProposal(undefined);
        return { status: "accepted", receipt: accepted.receipt as GrantReceipt };
      } catch (error) {
        sayIfRefused(error, t);
        setFailed((current) => ({ ...current, allowance: true }));
        return { status: "failed" };
      } finally {
        setRunning(undefined);
      }
    },
    [signer, proposal, prepareAllowance, refresh, t],
  );

  return {
    loaded,
    wallet,
    state,
    hasWallet,
    setUp,
    allowance,
    running,
    /** The wallet status could not be read at all (distinct from a failed setup step). */
    loadError,
    proposal,
    preparing,
    proposalError,
    prepareAllowance,
    failed,
    notReady,
    connecting,
    signerMissing,
    retry: { wallet: createWallet, setup: retrySetup },
    acceptAllowance,
    refresh,
  };
}
