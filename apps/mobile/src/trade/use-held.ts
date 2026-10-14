// A loading state held for at least a moment (Mitoshi's useHeldLoading), so a fast read doesn't flash a skeleton.
import * as React from "react";

const HOLD_MS = 300;

export function useHeld(loading: boolean, holdMs = HOLD_MS) {
  const [held, setHeld] = React.useState(loading);
  const since = React.useRef<number | undefined>(loading ? Date.now() : undefined);
  React.useEffect(() => {
    if (loading) {
      since.current = Date.now();
      setHeld(true);
      return undefined;
    }
    const left = since.current === undefined ? 0 : Math.max(0, holdMs - (Date.now() - since.current));
    const timer = setTimeout(() => setHeld(false), left);
    return () => clearTimeout(timer);
  }, [holdMs, loading]);
  return held;
}
