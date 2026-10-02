// R12, resume never restart: a card whose precondition the person just fixed (a top-up, a consent) carries the same
// request on by saying so in the conversation; the agent then repeats the same call. Outside a chat thread (the voice
// overlay, a card shown elsewhere) there is nothing to continue, and cards simply show what happened.
import * as React from "react";

const ChatResume = React.createContext<((text: string) => void) | undefined>(undefined);

export function ChatResumeProvider({ send, children }: { send: (text: string) => void; children: React.ReactNode }) {
  return <ChatResume.Provider value={send}>{children}</ChatResume.Provider>;
}

export const useChatResume = () => React.useContext(ChatResume);
