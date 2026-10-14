import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** iOS Reduce Transparency (Android never reports it): glass and blur become their opaque equivalents (FT116, A01). */
export function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (live) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}
