// The intelligence layer's cards (A5): earlier conversations that match a search. Each card renders the tool's real
// result; a row opens what it names.
import { useRouter } from "expo-router";
import { BookOpen, ExternalLink, MessagesSquare } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";

import type { HistoryHit, HistorySearchOutput, SuggestionsView } from "@kawase/api-client";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { ForYouList } from "@/home/for-you";
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

/** arc_knowledge: where the answer came from — each passage's title, opening its source. */
export function KnowledgeCard({ output }: { output: { passages: { title: string; source: string }[] } }) {
  const { t } = useT();
  if (output.passages.length === 0) return null;
  const host = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  return (
    <AgentCard eyebrow={t("insight.sources")} className="pb-1">
      <View className="-mx-4">
        {output.passages.map((passage) => (
          <ListRow
            key={`${passage.source}:${passage.title}`}
            leading={<Icon as={BookOpen} className="text-muted-foreground size-4" />}
            title={passage.title}
            subtitle={host(passage.source)}
            trailing={<Icon as={ExternalLink} className="text-muted-foreground size-4" />}
            onPress={() => void Linking.openURL(passage.source)}
          />
        ))}
      </View>
    </AgentCard>
  );
}

/** get_for_you: the same cards as Home's "For you", or a calm line when nothing needs the person. */
export function ForYouChatCard({ output }: { output: SuggestionsView }) {
  const { t } = useT();
  if (output.suggestions.length === 0)
    return (
      <AgentCard eyebrow={t("forYou.title")}>
        <Text className={cn("text-muted-foreground text-sm leading-6", TEXT_START)}>{t("forYou.nothing")}</Text>
      </AgentCard>
    );
  return <ForYouList view={output} />;
}
