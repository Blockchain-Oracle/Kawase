import { createContext, useContext } from "react";

export const SheetContext = createContext<(after?: () => void) => void>(() => undefined);
export const ExpandContext = createContext<() => void>(() => undefined);

/** Closes the sheet from inside it — the same slide-down as a drag — then runs `after` (a navigation, say). */
export function useSheetClose(): (after?: () => void) => void {
  return useContext(SheetContext);
}

/** Raises a sheet with detents to its tallest (a search field focusing, say); a no-op for content-sized sheets. */
export function useSheetExpand(): () => void {
  return useContext(ExpandContext);
}
