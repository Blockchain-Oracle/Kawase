// The layer above the tab pages and the dock: the + fan (it rises from the dock's centre) and the voice overlay (its
// orb rises from the same disc on a hold). Order matters: the voice overlay sits above everything. Rendered once: by
// the (tabs) layout, or on a desktop window by the signed-in area's layout over the rail and every page — there the
// rail lists the same actions, so only the voice overlay is drawn. Every action goes through the account gate, so a
// guest's first money tap opens the sign-in sheet in place and the action follows it.
import { useWide } from "@kawase/ui-native/lib/wide";

import { useAccountGate } from "@/onboarding/account-gate";
import { useOverlay } from "@/overlay/overlay-provider";
import { VoiceOverlay } from "@/overlay/voice-overlay";

import { ActionFan } from "./action-fan";

export function OverlayHost() {
  const overlay = useOverlay();
  const gate = useAccountGate();
  const wide = useWide();

  return (
    <>
      {wide ? null : (
        <ActionFan
          open={overlay.current === "fan"}
          onClose={overlay.close}
          origin={overlay.voiceTrigger}
          onChoose={(verb) => {
            overlay.close();
            gate(verb);
          }}
        />
      )}
      <VoiceOverlay open={overlay.current === "voice"} />
    </>
  );
}
