// Fees and the display currency (plan §A.4 12 and 14). Amounts in USDC base units; the rate converts US dollars.
import type { NetworkId } from "./types";

/** The wallet's fee reserve: Arc gas is USDC, so the USDC held pays for "~N actions". */
export type FeeReserveView = {
  network: NetworkId;
  hasWallet: boolean;
  usdc: string;
  /** What a typical transfer and a 7702 batch cost now. */
  perTransfer: string;
  perBatch: string;
  actionsLeft: number;
  /** What "Send max" keeps for fees. */
  reserve: string;
  low: boolean;
  /** A USDC/EURC send is carried by the relayer when the wallet cannot pay the fee. */
  relayer: boolean;
};

/** One US dollar in the display currency; `unavailable` names a currency with no rate today (USD is used). */
export type FxView = { currency: string; perUsd: number; at: string; supported: string[]; unavailable?: string | undefined };
