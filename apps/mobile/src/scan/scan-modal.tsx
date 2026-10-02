// The scanner over the current screen (Send's recipient step, the chat), so what it opens replaces or follows that
// screen instead of stacking a second one. `onCode` lets the chat take the raw code for the agent.
import { Modal } from "react-native";

import { Scanner } from "./scanner";
import type { ScanOrigin } from "./use-pay-code";

export function ScanModal({
  open,
  origin,
  onClose,
  onCode,
}: {
  open: boolean;
  origin: ScanOrigin;
  onClose: () => void;
  onCode?: ((code: string) => boolean) | undefined;
}) {
  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      {open ? <Scanner origin={origin} onClose={onClose} onOpened={onClose} onCode={onCode} /> : null}
    </Modal>
  );
}
