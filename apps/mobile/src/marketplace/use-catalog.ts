// The marketplace catalog on the device (GET /marketplace/catalog, public data): a page of tools for the search and the
// category, the counts per category, and more pages as the list scrolls. A failed refresh keeps what was shown, marked
// stale; a new search or category starts from the first page. One tool's detail (its endpoints, by sub-group) likewise.
import * as React from "react";

import type { CatalogToolDetail, CatalogView, MarketplaceCategory } from "@kawase/api-client";

import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const PAGE = 24;
const SEARCH_DEBOUNCE_MS = 250;

export type CatalogState = {
  view: CatalogView | undefined;
  tools: CatalogView["tools"];
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
  /** When the shown list was read on this device (for the stale tick after a failed refresh). */
  readAt: number | undefined;
  reload: () => void;
  more: () => void;
};

export function useCatalog(query: string, category: MarketplaceCategory | null): CatalogState {
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [view, setView] = React.useState<CatalogView>();
  const [tools, setTools] = React.useState<CatalogView["tools"]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [readAt, setReadAt] = React.useState<number>();
  const [tick, setTick] = React.useState(0);
  const ticket = React.useRef(0);
  const words = query.trim();

  React.useEffect(() => {
    const mine = ++ticket.current;
    setLoading(true);
    const timer = setTimeout(
      () => {
        api.marketCatalog
          .list({ q: words || undefined, category: category ?? undefined, network, limit: PAGE, offset: 0 })
          .then((fresh) => {
            if (mine !== ticket.current) return;
            setView(fresh);
            setTools(fresh.tools);
            setFailed(false);
            setReadAt(Date.now());
          })
          .catch(() => mine === ticket.current && setFailed(true))
          .finally(() => mine === ticket.current && setLoading(false));
      },
      words ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [words, category, network, tick]);

  const more = React.useCallback(() => {
    if (!view || loading || loadingMore || tools.length >= view.page.total) return;
    const mine = ticket.current;
    setLoadingMore(true);
    api.marketCatalog
      .list({ q: words || undefined, category: category ?? undefined, network, limit: PAGE, offset: tools.length })
      .then((next) => {
        if (mine !== ticket.current) return;
        setTools((shown) => [...shown, ...next.tools.filter((tool) => !shown.some((entry) => entry.key === tool.key))]);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [category, loading, loadingMore, network, tools.length, view, words]);

  return { view, tools, loading, loadingMore, failed, readAt, reload: () => setTick((value) => value + 1), more };
}

export function useTool(key: string | null, group: string | null) {
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const [detail, setDetail] = React.useState<CatalogToolDetail>();
  const [failed, setFailed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!key) return undefined;
    let live = true;
    setLoading(true);
    api.marketCatalog
      .tool(key, { network, ...(group ? { group } : {}) })
      .then((fresh) => {
        if (!live) return;
        setDetail(fresh);
        setFailed(false);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key, group, network, tick]);
  const shown = detail && detail.tool.key === key ? detail : undefined;
  return { detail: shown, failed, loading, reload: () => setTick((value) => value + 1) };
}
