// A newer Kawase is live (see update-ready.tsx): the browser learns which build it loaded from /version.txt (written
// by publish-web.sh with each release) and asks again whenever the tab comes back into view and every few minutes;
// when the live build has changed, a toast offers Reload. Never a reload on its own.
import * as React from "react";
import { toast } from "sonner-native";

import { useT } from "@/i18n";

const TOAST_ID = "kawase-update";
const CHECK_EVERY_MS = 300_000;

async function liveVersion(): Promise<string | null> {
  try {
    const response = await fetch(`/version.txt?at=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.text()).trim() || null;
  } catch {
    return null;
  }
}

export function UpdateReady() {
  const { t } = useT();
  const label = React.useRef({ title: t("update.readyTitle"), action: t("update.readyReload") });
  label.current = { title: t("update.readyTitle"), action: t("update.readyReload") };

  React.useEffect(() => {
    let mine: string | null = null;
    let told = false;
    let live = true;
    const check = async () => {
      const now = await liveVersion();
      if (!live || !now || told) return;
      if (mine === null) {
        mine = now;
        return;
      }
      if (now === mine) return;
      told = true;
      toast(label.current.title, { id: TOAST_ID, duration: Infinity, action: { label: label.current.action, onClick: () => window.location.reload() } });
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  return null;
}
