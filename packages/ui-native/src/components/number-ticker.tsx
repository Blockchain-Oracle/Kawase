// A live number that counts to its new value (21st.dev 21513 · Number Ticker Currency Counter, as a native twin):
// the balance hero and prices ease from the old figure to the new one instead of jumping. The caller formats (the
// display currency and locale live there); with reduced motion the new figure simply appears. Screen readers hear
// only the final value.
import { MOTION } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import * as React from "react";

type NumberTickerProps = {
  value: number;
  format: (value: number) => string;
  className?: string;
};

const CUBIC = 3;
const easeOut = (progress: number) => 1 - (1 - progress) ** CUBIC;

function NumberTicker({ value, format, className }: NumberTickerProps) {
  const reduced = useReducedMotionLive();
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);

  React.useEffect(() => {
    if (reduced || from.current === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const start = from.current;
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (Date.now() - began) / MOTION.tickerMs);
      setShown(start + (value - start) * easeOut(progress));
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, reduced]);

  return (
    <Amount accessibilityLabel={format(value)} className={className}>
      {format(shown)}
    </Amount>
  );
}

export { NumberTicker };
export type { NumberTickerProps };
