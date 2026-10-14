// A toast with its feedback: success arrives with the confirm sound and haptic, failure with the failure cue, plain
// information with neither (ticks and navigation never get a sound). One call so no screen pairs them by hand.
import { toast } from "sonner-native";

import { fire } from "@/feedback/fire";

export type NotifyOptions = { description?: string; identity?: string };

export const notify = {
  /** Something worked and the person should know ("Copied", "Saved"): the quiet confirm. */
  success(title: string, options: NotifyOptions = {}) {
    fire("confirm");
    toast.success(title, options.description ? { description: options.description } : undefined);
  },
  /** Money arrived or a result was confirmed: the full outcome cue, once per identity. */
  arrived(title: string, options: NotifyOptions = {}) {
    fire("filled", { sound: "received", ...(options.identity ? { identity: options.identity } : {}) });
    toast.success(title, options.description ? { description: options.description } : undefined);
  },
  info(title: string, options: NotifyOptions = {}) {
    toast(title, options.description ? { description: options.description } : undefined);
  },
  error(title: string, options: NotifyOptions = {}) {
    fire("fail", { sound: "error" });
    toast.error(title, options.description ? { description: options.description } : undefined);
  },
};
