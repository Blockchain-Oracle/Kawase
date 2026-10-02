// Where the exit kit's "move my money out" goes: the Withdraw hub once it is in the app (builder A's lane), Send until
// then. The check reads the app's own route table (expo-router's sitemap), so the link switches the day the screen
// lands, with no flag to remember. Route groups like "(app)" are not part of a path, so they are dropped.
import { useSitemap, type Href, type SitemapType } from "expo-router";
import * as React from "react";

const WITHDRAW = "/withdraw";
const SEND = "/send";
const GROUP_SEGMENT = /\/\([^/]+\)/g;

function hasPath(node: SitemapType | null, path: string): boolean {
  if (!node) return false;
  if (typeof node.href === "string" && (node.href.replace(GROUP_SEGMENT, "") || "/") === path) return true;
  return node.children.some((child) => hasPath(child, path));
}

export function useExitRoute(): Href {
  const sitemap = useSitemap();
  // Typed routes know only the screens that exist today, so the future path is cast once here.
  return React.useMemo(() => (hasPath(sitemap, WITHDRAW) ? (WITHDRAW as Href) : SEND), [sitemap]);
}
