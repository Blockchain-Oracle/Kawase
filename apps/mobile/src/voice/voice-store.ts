// The live voice conversation, readable from anywhere in the app (Abu, 10-16: talk to Kawase in the background, keep
// moving through the app, and see what it needs wherever you are). The room and its engine (voice-session, voice-engine)
// write here; the full view, the island, the card sheet and the edge glow read here, so minimising the full view never
// ends the conversation. One conversation at a time; a preview (Settings → Voice) is its own quiet room.
import * as React from "react";

export type VoicePhase = "connecting" | "listening" | "thinking" | "speaking" | "muted" | "failed";

/** A card one of Kawase's tools produced in the conversation (the same parts the chat draws). */
export type VoiceCard = { toolName: string; toolCallId: string; output?: unknown };

type Snapshot = {
  phase: VoicePhase;
  /** Kawase's latest words, for the island's one line. */
  caption: string;
  muted: boolean;
  cards: VoiceCard[];
  /** Cards that arrived while the full view was down: the card sheet shows the newest until it is seen. */
  unseen: string[];
  threadId: string | null;
  /** The voice whose hello is playing in Settings → Voice, if one is. */
  previewing: string | null;
};

const INITIAL: Snapshot = { phase: "connecting", caption: "", muted: false, cards: [], unseen: [], threadId: null, previewing: null };

let snapshot: Snapshot = INITIAL;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());

/** What the room's engine lets the island and the full view do. */
type Actions = { toggleMute: () => void; stop: () => Promise<void> };
let actions: Actions | null = null;

export const voiceStore = {
  get: () => snapshot,
  set(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    publish();
  },
  /** A conversation ended: everything back to the start (a preview keeps its own flag). */
  reset() {
    snapshot = { ...INITIAL, previewing: snapshot.previewing };
    actions = null;
    publish();
  },
  /** A card from a tool: replaces an earlier version of itself; unseen when the full view is down. */
  addCard(card: VoiceCard, seen: boolean) {
    const cards = [...snapshot.cards.filter((entry) => entry.toolCallId !== card.toolCallId), card];
    const unseen = seen ? snapshot.unseen : [...snapshot.unseen.filter((id) => id !== card.toolCallId), card.toolCallId];
    voiceStore.set({ cards, unseen });
  },
  markSeen(id?: string) {
    voiceStore.set({ unseen: id ? snapshot.unseen.filter((entry) => entry !== id) : [] });
  },
  setActions(next: Actions | null) {
    actions = next;
  },
  toggleMute: () => actions?.toggleMute(),
  stop: () => actions?.stop() ?? Promise.resolve(),
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** One value from the live conversation (select a primitive or a stable reference). */
export function useVoice<T>(select: (state: Snapshot) => T): T {
  return React.useSyncExternalStore(voiceStore.subscribe, () => select(snapshot), () => select(INITIAL));
}
