// What the history and account tools hand the chat's cards (B2-2: chat has the same reach as the screens).
// Every output records the network it was read on, so a stored card never borrows today's network. Nothing in here
// moves money or changes the account by itself: signing a device out and deleting the account are
// proposals the person finishes on the card (a tap, or the typed @handle on the delete screen).
import type { DeviceView } from "./account";
import type { ReportView, WhyView } from "./history";
import type { NetworkId } from "./types";

type Blocked = "needs_sign_in" | "needs_wallet" | "unavailable";

/** export_history: a short-lived download link for one month's file (no sign-in needed to open it); `path` is on the api. */
export type ExportLinkOutput =
  | { network: NetworkId; status: "ready"; month: string; format: "csv" | "beancount"; path: string; filename: string; expiresAt: string }
  | { network: NetworkId; status: Blocked };

/** weekly_report: the report card. */
export type WeeklyReportOutput = { network: NetworkId; status: "ready"; report: ReportView } | { network: NetworkId; status: Blocked };

/** explain_transaction: the Why card for one movement (the latest one when not named). */
export type ExplainOutput =
  | { network: NetworkId; status: "ready"; why: WhyView; movement: { direction: "in" | "out"; asset: string; amount: string; at: string } | null }
  | { network: NetworkId; status: "not_found" | Blocked };

/** sign_out_device: the devices, with the one the person named marked; signing out happens on the card. */
export type DeviceSignOutProposal = { status: "proposed"; target: string | null; devices: DeviceView[] } | { status: "needs_sign_in" };

/** delete_account: what deleting means and where it is done (the person types their @handle there). */
export type DeleteAccountProposal = { status: "proposed"; handle: string | null } | { status: "needs_sign_in" };
