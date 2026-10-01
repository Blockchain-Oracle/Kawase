// Keeps push in step with the session: once someone is signed in (or a guest) on a phone that allows notifications,
// its current token is sent to Kawase; a tapped notification opens its screen.
import { useRouter } from "expo-router";
import * as React from "react";

import { useSession } from "@/session/session-provider";

import { pathOf, pushState, registerPushToken, useLastNotificationResponse } from "./push";

export function PushSync() {
  const { user } = useSession();
  const router = useRouter();
  const response = useLastNotificationResponse();
  const userId = user?.id;

  React.useEffect(() => {
    if (!userId) return;
    void pushState().then((state) => (state === "on" ? registerPushToken() : false));
  }, [userId]);

  const opened = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const path = pathOf(response);
    const id = response?.notification.request.identifier;
    if (!path || !userId || opened.current === id) return;
    opened.current = id;
    router.push(path as never);
  }, [response, userId, router]);

  return null;
}
