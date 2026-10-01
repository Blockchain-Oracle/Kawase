// The chat's connection to the agent (spike 7's pattern): useChat over the AI SDK's HTTP transport with expo/fetch
// on native (streams incrementally on iOS through Coolify's Traefik), the session token as a bearer header, and only
// the newest message in the body — the api keeps the thread's history. When a device-side tool (the network switch
// card) gets its answer, the conversation continues by itself.
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import * as React from "react";
import { Platform } from "react-native";

import { API_URL } from "@/session/api";
import { sessionStorage } from "@/session/storage";

const CHAT_PATH = "/agent/chat";

export function useAgentChat(threadId: string, initialMessages: UIMessage[]) {
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `${API_URL}${CHAT_PATH}`,
        ...(Platform.OS === "web" ? {} : { fetch: expoFetch as unknown as typeof globalThis.fetch }),
        headers: async (): Promise<Record<string, string>> => {
          const token = await sessionStorage.getToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
        prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages[messages.length - 1] } }),
      }),
    [],
  );
  return useChat({ id: threadId, messages: initialMessages, transport, sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls });
}
