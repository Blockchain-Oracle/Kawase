// The conversations, as the drop-down sheet the owner liked (ABU-BRIEF-VERBATIM 10-03: "the history sheet as a
// drop-down"): a search over every conversation's words (the server's), New conversation, and the list newest first,
// each opening its thread. A conversation's … renames it or deletes it (hold to delete). Opened from Home's composer
// and from the thread screen. Loading is a list skeleton; a list that could not be read keeps the last one, marked.
import * as React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ThreadSummary } from "@kawase/api-client";
import { MoreHorizontal, SquarePen } from "lucide-react-native";

import { Button, ErrorState, HoldButton, Icon, ListRow, LoadingState, SearchField, SIZE, SPACE, TYPE, diagnose, useTheme, type Diagnosis } from "@/components/kit";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { LIST_DETENTS } from "@/components/sheet/constants";
import { notify } from "@/components/toast/notify";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";

import { useHistorySearch } from "./use-history-search";

const TITLE_MAX = 60;

export function ThreadHistorySheet({
  onClose,
  onOpen,
  onNew,
  current,
  onDeleted,
}: {
  onClose: () => void;
  onOpen: (threadId: string) => void;
  onNew: () => void;
  /** The conversation on screen, marked in the list. */
  current?: string | null | undefined;
  onDeleted?: ((threadId: string) => void) | undefined;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const [threads, setThreads] = React.useState<ThreadSummary[] | undefined>();
  const [error, setError] = React.useState<Diagnosis | null>(null);
  const [search, setSearch] = React.useState("");
  const [managing, setManaging] = React.useState<ThreadSummary | null>(null);
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const found = useHistorySearch(search);

  const load = React.useCallback(async () => {
    try {
      const result = await api.agent.threads();
      setThreads(result.threads);
      setError(null);
    } catch (failure) {
      setError(diagnose(failure));
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const when = (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const name = (thread: ThreadSummary) => thread.title ?? t("chat.untitled");
  const query = search.trim().toLocaleLowerCase(locale);
  const shown = (threads ?? []).filter((thread) => name(thread).toLocaleLowerCase(locale).includes(query));

  const rename = async () => {
    if (!managing || !title.trim()) return;
    setSaving(true);
    try {
      const { thread } = await api.agent.renameThread(managing.id, title.trim());
      setThreads((list) => list?.map((entry) => (entry.id === thread.id ? { ...entry, title: thread.title } : entry)));
      setManaging(null);
      notify.info(t("chat.threadRenamed"));
    } catch {
      notify.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!managing) return;
    const gone = managing.id;
    setSaving(true);
    try {
      await api.agent.deleteThread(gone);
      setThreads((list) => list?.filter((entry) => entry.id !== gone));
      setManaging(null);
      notify.info(t("chat.threadDeleted"));
      onDeleted?.(gone);
    } catch {
      notify.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} closeLabel={t("shell.kit.closeNamed", { name: t("chat.history") })} detents={LIST_DETENTS}>
      <SheetHeading title={managing ? t("chat.manageThread") : t("chat.history")} />
      {managing ? (
        <View style={styles.body}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("chat.renamePlaceholder")}
            placeholderTextColor={color.text3}
            accessibilityLabel={t("chat.rename")}
            maxLength={TITLE_MAX}
            onSubmitEditing={() => void rename()}
            style={[TYPE.field, styles.input, { backgroundColor: color.input, color: color.ink }]}
          />
          <Button label={t("chat.rename")} disabled={saving || !title.trim()} onPress={() => void rename()} />
          <HoldButton label={t("chat.holdToDeleteThread")} holdingLabel={t("chat.deletingThread")} ready={!saving} busy={saving} onConfirm={() => void remove()} />
          <Button label={t("common.back")} variant="ghost" onPress={() => setManaging(null)} />
        </View>
      ) : (
        <View style={styles.body}>
          <SearchField value={search} onChange={setSearch} placeholder={t("chat.search")} />
          <Button
            label={t("chat.newChat")}
            variant="secondary"
            leading={<Icon icon={SquarePen} size={SIZE.iconSm} />}
            onPress={() => {
              onClose();
              onNew();
            }}
          />
          {error && threads ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("chat.historyStale")}</Text> : null}
          {found.failed ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("insight.searchOffline")}</Text> : null}
          {found.hits ? (
            found.hits.length > 0 ? (
              found.hits.map((hit) => (
                <ListRow
                  key={hit.threadId}
                  title={hit.title ?? t("chat.untitled")}
                  detail={hit.snippet}
                  onPress={() => {
                    onClose();
                    onOpen(hit.threadId);
                  }}
                />
              ))
            ) : (
              <Text style={[TYPE.body, styles.center, { color: color.text3 }]}>{t("chat.noMatches")}</Text>
            )
          ) : !threads ? (
            error ? (
              <ErrorState diagnosis={error} retry={() => void load()} variant="strip" />
            ) : (
              <LoadingState shape="list" />
            )
          ) : shown.length > 0 ? (
            shown.map((thread) => (
              <ListRow
                key={thread.id}
                title={`${thread.id === current ? "• " : ""}${name(thread)}`}
                detail={`${thread.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} · ${when(thread.lastMessageAt)}`}
                onPress={() => {
                  onClose();
                  onOpen(thread.id);
                }}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("chat.threadOptions", { title: name(thread) })}
                    hitSlop={SPACE.sm}
                    onPress={() => {
                      setManaging(thread);
                      setTitle(thread.title ?? "");
                    }}
                  >
                    <Icon icon={MoreHorizontal} size={SIZE.iconSm} tint={color.text3} />
                  </Pressable>
                }
              />
            ))
          ) : (
            <Text style={[TYPE.body, styles.center, { color: color.text3 }]}>{query ? t("chat.noMatches") : t("chat.noHistory")}</Text>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm, paddingTop: SPACE.md },
  input: { minHeight: SIZE.inputHeight, borderRadius: SPACE.lg, paddingHorizontal: SPACE.lg },
  center: { textAlign: "center", paddingVertical: SPACE.sm },
});
