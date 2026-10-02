// The intelligence layer's cards (A5): earlier conversations that match a search. Each card renders the tool's real
// result; a row opens what it names.
import { useRouter } from "expo-router";
import { MessagesSquare } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { HistoryHit, HistorySearchOutput } from "@kawase/api-client";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";

import { AgentCard } from "./card";

/** One matching conversation: its title, when, and the words around the match. Shared with the history sheet. */
export function HistoryHitRow({ hit, onOpen }: { hit: HistoryHit; onOpen: (threadId: string) => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(hit.at));
  const network = hit.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const who = hit.role === "user" ? t("insight.you") : hit.role === "assistant" ? "Kawase" : undefined;
  return (
    <ListRow
      title={hit.title ?? t("chat.untitled")}
      subtitle={`${who ? `${who}: ` : ""}${hit.snippet}`}
      accessibilityLabel={`${hit.title ?? t("chat.untitled")}, ${hit.snippet}, ${network}, ${when}`}
      trailing={<Text className="text-muted-foreground text-xs">{when}</Text>}
      onPress={() => onOpen(hit.threadId)}
    />
  );
}

export function HistorySearchCard({ output }: { output: HistorySearchOutput }) {
  const { t } = useT();
  const router = useRouter();
  const open = (thread: string) => router.navigate({ pathname: "/chat", params: { thread } });
  return (
    <AgentCard eyebrow={t("insight.searchTitle")} className="pb-1">
      {output.hits.length === 0 ? (
        <View className="flex-row items-start gap-3 pb-3">
          <Icon as={MessagesSquare} className="text-muted-foreground mt-0.5 size-5" />
          <Text className={cn("text-muted-foreground flex-1 text-sm leading-6", TEXT_START)}>
            {t("insight.searchNone", { query: output.query })}
          </Text>
        </View>
      ) : (
        <View className="-mx-4">
          {output.hits.slice(0, CARD_HITS).map((hit) => (
            <HistoryHitRow key={hit.threadId} hit={hit} onOpen={open} />
          ))}
        </View>
      )}
    </AgentCard>
  );
}

/** Conversations listed on the card (the history sheet shows all of them). */
const CARD_HITS = 5;
