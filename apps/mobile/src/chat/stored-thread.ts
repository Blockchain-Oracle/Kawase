// The api's own record of one conversation, for Retry and for reopening: the messages it kept, an empty list for a
// conversation it never saved (its first message never arrived), or undefined when it could not be read at all.
import type { UIMessage } from "ai";

import { ApiError } from "@kawase/api-client";

import { api } from "@/session/api";

const HTTP_NOT_FOUND = 404;

export async function storedThread(id: string): Promise<UIMessage[] | undefined> {
  try {
    return (await api.agent.thread(id)).messages as UIMessage[];
  } catch (error) {
    return error instanceof ApiError && error.status === HTTP_NOT_FOUND ? [] : undefined;
  }
}
