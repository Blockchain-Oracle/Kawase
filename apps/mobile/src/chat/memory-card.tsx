// Memory in the conversation (cards/agent-business.md): the card after remember_fact / forget_fact (what was kept or
// forgotten, with Undo and a way to Settings → Memory), and the quiet "From memory" line under a reply that relied
// on a remembered fact — the agent always says when it uses one. A fact naming an @handle the person did not write,
// or one that came after outside content, is not saved until they tap Save here (H2).
import { useRouter } from "expo-router";
import { Brain } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { toast } from "sonner-native";

import type { AgentMessageMetadata, MemoryFact, MemoryToolOutput } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { api } from "@/session/api";

import { AgentCard } from "./card";

export function MemoryCard({ output }: { output: MemoryToolOutput }) {
  const { t } = useT();
  const router = useRouter();
  const [undone, setUndone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [turnedOn, setTurnedOn] = React.useState(false);
  // A fact the card asked about, once the person saved it.
  const [kept, setKept] = React.useState<MemoryFact | null>(null);
  const savedId = output.status === "saved" ? output.fact.id : kept?.id;

  const undo = async () => {
    if (!savedId) return;
    setBusy(true);
    try {
      await api.memory.forget(savedId);
      setUndone(true);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  const keep = async () => {
    if (output.status !== "confirm") return;
    setBusy(true);
    try {
      setKept((await api.memory.add(output.fact)).fact);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  const turnOn = async () => {
    setBusy(true);
    try {
      await api.memory.setEnabled(true);
      setTurnedOn(true);
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const fact = output.status === "saved" || output.status === "forgotten" ? output.fact.fact : output.status === "confirm" ? output.fact : undefined;
  const title =
    output.status === "saved"
      ? undone
        ? t("memory.cardForgotten")
        : output.updated
          ? t("memory.cardUpdated")
          : t("memory.cardRemembered")
      : output.status === "forgotten"
        ? t("memory.cardForgotten")
        : output.status === "confirm"
          ? undone
            ? t("memory.cardForgotten")
            : kept
              ? t("memory.cardRemembered")
              : t("memory.cardConfirm")
          : undefined;
  const note =
    output.status === "not_found"
      ? t("memory.cardNotFound")
      : output.status === "memory_off"
        ? turnedOn
          ? t("memory.on")
          : t("memory.cardOff")
        : output.status === "full"
          ? t("memory.cardFull")
          : output.status === "refused"
            ? t("memory.cardRefused")
            : undefined;

  return (
    <AgentCard eyebrow={title ?? t("settings.memory")}>
      <View className="flex-row items-start gap-3">
        <Icon as={Brain} className="text-ring mt-0.5 size-5" />
        <Text className={cn("text-foreground flex-1 text-base leading-6", TEXT_START, undone && "text-muted-foreground line-through")}>
          {fact ?? note}
        </Text>
      </View>
      {output.status === "confirm" && !kept ? (
        <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>
          {t(output.reason === "not_typed" ? "memory.confirmNotTyped" : "memory.confirmOutside")}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        {savedId && !undone ? (
          <Button size="sm" variant="secondary" disabled={busy} onPress={() => void undo()}>
            <Text>{t("memory.undo")}</Text>
          </Button>
        ) : null}
        {output.status === "confirm" && !kept ? (
          <Button size="sm" disabled={busy} onPress={() => void keep()}>
            <Text>{t("memory.save")}</Text>
          </Button>
        ) : null}
        {output.status === "memory_off" && !turnedOn ? (
          <Button size="sm" disabled={busy} onPress={() => void turnOn()}>
            <Text>{t("memory.cardTurnOn")}</Text>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onPress={() => router.push("/memory")}>
          <Text className="text-muted-foreground">{t("memory.manage")}</Text>
        </Button>
      </View>
    </AgentCard>
  );
}

/** Under a reply that relied on remembered facts: one quiet line each, opening Settings → Memory. */
export function MemoryNote({ metadata }: { metadata: unknown }) {
  const { t } = useT();
  const router = useRouter();
  const used = (metadata as AgentMessageMetadata | undefined)?.memoryUsed;
  if (!used || used.length === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/memory")}
      className="active:opacity-70 flex-row items-start gap-1.5 self-start"
    >
      <Icon as={Brain} className="text-muted-foreground mt-0.5 size-3.5" />
      <Text className={cn("text-muted-foreground flex-1 text-xs leading-5", TEXT_START)}>
        {used.map((fact) => t("memory.fromMemory", { fact: fact.fact })).join("\n")}
      </Text>
    </Pressable>
  );
}
