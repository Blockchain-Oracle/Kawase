// The history sheet's search (surfaces.md: "the chat history sheet … gains search across all threads"): what the
// person types is searched on the server across every conversation's words, cards and recipients, a moment after
// they stop typing. Undefined hits: nothing asked yet, or the answer is still on its way (the titles stand in).
import * as React from "react";

import type { HistoryHit } from "@kawase/api-client";

import { api } from "@/session/api";

/** Wait this long after the last keystroke. */
const DEBOUNCE_MS = 250;
/** One letter matches too much to be useful. */
const MIN_CHARS = 2;

export function useHistorySearch(text: string): { hits: HistoryHit[] | undefined; failed: boolean } {
  const query = text.trim();
  const [state, setState] = React.useState<{ query: string; hits: HistoryHit[] | undefined; failed: boolean }>({ query: "", hits: undefined, failed: false });
  React.useEffect(() => {
    if (query.length < MIN_CHARS) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      api
        .search(query)
        .then((result) => current && setState({ query, hits: result.hits, failed: false }))
        .catch(() => current && setState({ query, hits: undefined, failed: true }));
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);
  // An answer for an older query is never shown under a newer one.
  if (query.length < MIN_CHARS || state.query !== query) return { hits: undefined, failed: false };
  return { hits: state.hits, failed: state.failed };
}
