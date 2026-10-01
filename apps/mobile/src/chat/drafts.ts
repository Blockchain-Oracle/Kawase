// What the person was typing, per conversation, for as long as the app runs: switching threads, a reconnect or the
// chat remounting never loses a half-written message (Codex review R14). A conversation with nothing sent yet
// uses one shared slot, since every new conversation gets a fresh id. Read when a conversation opens; written on
// every change.
const NEW_THREAD = "new";
const drafts = new Map<string, string>();

export const draftKey = (threadId: string, hasMessages: boolean) => (hasMessages ? threadId : NEW_THREAD);

export const readDraft = (key: string) => drafts.get(key) ?? "";

export function saveDraft(key: string, text: string) {
  if (text) drafts.set(key, text);
  else drafts.delete(key);
}
