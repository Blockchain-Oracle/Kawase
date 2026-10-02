// Settings → Memory (cards/agent-business.md): every fact Kawase keeps about the person, where it came from and when
// it was last used; tap one to edit or forget it, add one by hand, forget everything, or turn memory off (then
// nothing is read or saved; the facts stay until forgotten). The agent says in chat whenever it uses one.
import { useFocusEffect, useRouter } from "expo-router";
import { Brain, MessageSquare, Plus } from "lucide-react-native";
import * as React from "react";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { ApiError, type MemoryFact, type MemoryView } from "@kawase/api-client";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useThemeColors } from "@/theme/use-theme-colors";

const SKELETON_HEIGHT = 160;
const FACT_MAX = 200;
const FACTS_LIMIT = 100;

type Editor = { id?: string; text: string; sourceThreadId?: string | null };

export function MemoryScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [view, setView] = React.useState<MemoryView>();
  const [failed, setFailed] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [editor, setEditor] = React.useState<Editor>();
  const [confirmAll, setConfirmAll] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setView(await api.memory.get());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
  const subtitle = (fact: MemoryFact) =>
    [
      fact.sourceThreadId ? t("memory.fromChat", { date: date(fact.createdAt) }) : t("memory.addedByYou", { date: date(fact.createdAt) }),
      ...(fact.lastUsedAt ? [t("memory.lastUsed", { date: date(fact.lastUsedAt) })] : []),
    ].join(" · ");

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast(error instanceof ApiError && error.code === "conflict" ? t("memory.full", { limit: FACTS_LIMIT }) : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (enabled: boolean) =>
    void run(async () => {
      setView(await api.memory.setEnabled(enabled));
    });

  const save = () =>
    void run(async () => {
      const text = editor?.text.trim();
      if (!editor || !text) return;
      if (editor.id) await api.memory.edit(editor.id, text);
      else await api.memory.add(text);
      setEditor(undefined);
      await load();
    });

  const forget = (id: string) =>
    void run(async () => {
      await api.memory.forget(id);
      setEditor(undefined);
      toast(t("memory.forgotten"));
      await load();
    });

  const forgetAll = () =>
    void run(async () => {
      await api.memory.forgetAll();
      setConfirmAll(false);
      toast(t("memory.forgotten"));
      await load();
    });

  const facts = view?.facts ?? [];
  return (
    <Page
      title={t("settings.memory")}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      {failed && !view ? (
        <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
          <Text accessibilityRole="alert" className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>
            {t("memory.failed")}
          </Text>
          <Button size="sm" variant="secondary" onPress={() => void load()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      ) : !view ? (
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      ) : (
        <>
          <View className="gap-2">
            <ListGroup>
              <ListRow
                leading={<Icon as={Brain} className="text-muted-foreground size-5" />}
                title={t("memory.toggle")}
                trailing={
                  <Switch checked={view.enabled} disabled={busy} onCheckedChange={toggle} accessibilityLabel={t("memory.toggle")} />
                }
                onPress={() => toggle(!view.enabled)}
              />
            </ListGroup>
            <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>
              {view.enabled ? t("memory.toggleBody") : t("memory.offNote")}
            </Text>
          </View>

          <Section title={facts.length > 0 ? `${t("memory.listTitle")} · ${facts.length}` : t("memory.listTitle")}>
            {facts.length > 0 ? (
              <ListGroup>
                {facts.map((fact) => (
                  <ListRow
                    key={fact.id}
                    title={fact.fact}
                    subtitle={subtitle(fact)}
                    chevron
                    onPress={() => setEditor({ id: fact.id, text: fact.fact, sourceThreadId: fact.sourceThreadId })}
                  />
                ))}
              </ListGroup>
            ) : (
              <Text className={cn("text-muted-foreground px-1 text-sm leading-6", TEXT_START)}>{t("memory.empty")}</Text>
            )}
            <Button variant="secondary" disabled={busy} onPress={() => setEditor({ text: "" })}>
              <Icon as={Plus} className="size-4" />
              <Text>{t("memory.add")}</Text>
            </Button>
          </Section>

          {facts.length > 0 ? (
            confirmAll ? (
              <View className="bg-card border-border gap-3 rounded-2xl border p-4">
                <Text className={cn("text-foreground text-sm leading-6", TEXT_START)}>
                  {t("memory.forgetAllConfirm", { count: facts.length })}
                </Text>
                <View className="flex-row gap-2">
                  <Button className="flex-1" variant="destructive" disabled={busy} onPress={forgetAll}>
                    <Text>{t("memory.forgetAll")}</Text>
                  </Button>
                  <Button className="flex-1" variant="secondary" disabled={busy} onPress={() => setConfirmAll(false)}>
                    <Text>{t("common.cancel")}</Text>
                  </Button>
                </View>
              </View>
            ) : (
              <Button variant="ghost" disabled={busy} onPress={() => setConfirmAll(true)}>
                <Text className="text-destructive">{t("memory.forgetAll")}</Text>
              </Button>
            )
          ) : null}
        </>
      )}

      <Sheet
        open={Boolean(editor)}
        onClose={() => setEditor(undefined)}
        title={editor?.id ? t("memory.editTitle") : t("memory.addTitle")}
        colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
        closeLabel={t("common.close")}
        bottomInset={insets.bottom}
        className="gap-3"
      >
        <SheetInput
          value={editor?.text ?? ""}
          onChangeText={(text) => setEditor((current) => (current ? { ...current, text } : current))}
          placeholder={t("memory.placeholder")}
          accessibilityLabel={t("memory.placeholder")}
          maxLength={FACT_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
        />
        <Button disabled={busy || !editor?.text.trim()} onPress={save}>
          <Text>{t("memory.save")}</Text>
        </Button>
        {editor?.sourceThreadId ? (
          <Button
            variant="secondary"
            onPress={() => {
              const thread = editor.sourceThreadId!;
              setEditor(undefined);
              router.push({ pathname: "/chat", params: { thread } });
            }}
          >
            <Icon as={MessageSquare} className="size-4" />
            <Text>{t("memory.openChat")}</Text>
          </Button>
        ) : null}
        {editor?.id ? (
          <Button variant="ghost" disabled={busy} onPress={() => forget(editor.id!)}>
            <Text className="text-destructive">{t("memory.forget")}</Text>
          </Button>
        ) : null}
      </Sheet>
    </Page>
  );
}
