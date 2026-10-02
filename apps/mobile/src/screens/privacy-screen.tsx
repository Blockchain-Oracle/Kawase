// Settings → Data & privacy (cards/automate-safety.md; capability matrix "Thread … delete, export transcript"): how long
// Kawase keeps conversations (chat and voice are the same threads), export them as a text file, delete them all now,
// and export the money history (the Activity export). Deleting asks once more; it cannot be undone.
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { PrivacySettings } from "@kawase/api-client";
import { TRANSCRIPT_RETENTION_CHOICES } from "@kawase/config";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { ExportSheet } from "@/history/export-sheet";
import { shareTextFile } from "@/history/share-file";
import { useT } from "@/i18n";
import { Chip } from "@/marketplace/parts";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

const SKELETON_HEIGHT = 120;

export function PrivacyScreen() {
  const { t } = useT();
  const { user } = useSession();
  const [settings, setSettings] = React.useState<PrivacySettings>();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    void api.privacy
      .get()
      .then(setSettings)
      .catch(() => toast(t("common.error")));
  }, [t]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t("privacy.title")}>
      {!settings ? (
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      ) : (
        <>
          <Section title={t("privacy.conversations")}>
            <Text className={cn("text-muted-foreground px-1 text-sm leading-5", TEXT_START)}>{t("privacy.count", { count: String(settings.conversations) })}</Text>
            <Text className={cn("text-foreground px-1 text-base font-semibold", TEXT_START)}>{t("privacy.keep")}</Text>
            <View className="flex-row flex-wrap gap-2">
              <Chip label={t("privacy.keepForever")} selected={settings.transcriptRetentionDays === null} disabled={busy} onPress={() => void act(async () => setSettings(await api.privacy.setRetention(null)))} />
              {TRANSCRIPT_RETENTION_CHOICES.map((days) => (
                <Chip key={days} label={t("privacy.keepDays", { days: String(days) })} selected={settings.transcriptRetentionDays === days} disabled={busy} onPress={() => void act(async () => setSettings(await api.privacy.setRetention(days)))} />
              ))}
            </View>
            <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("privacy.keepBody")}</Text>
            <Button
              variant="secondary"
              disabled={busy || settings.conversations === 0}
              onPress={() => void act(async () => shareTextFile({ filename: "kawase-conversations.txt", body: await api.privacy.exportTranscripts(), mimeType: "text/plain" }))}
            >
              <Text>{t("privacy.exportConversations")}</Text>
            </Button>
            {!confirming ? (
              <Button variant="ghost" disabled={busy || settings.conversations === 0} onPress={() => setConfirming(true)}>
                <Text className="text-destructive">{t("privacy.deleteConversations")}</Text>
              </Button>
            ) : (
              <View className="bg-card border-border gap-3 rounded-3xl border p-4">
                <Text className={cn("text-foreground text-base", TEXT_START)}>{t("privacy.deleteConfirm", { count: String(settings.conversations) })}</Text>
                <View className="flex-row gap-2">
                  <Button className="flex-1" variant="destructive" disabled={busy} onPress={() => void act(async () => {
                    setSettings(await api.privacy.deleteTranscripts());
                    setConfirming(false);
                    toast(t("privacy.deleted"));
                  })}>
                    <Text>{t("privacy.delete")}</Text>
                  </Button>
                  <Button className="flex-1" variant="secondary" onPress={() => setConfirming(false)}>
                    <Text>{t("common.cancel")}</Text>
                  </Button>
                </View>
              </View>
            )}
          </Section>
          <Section title={t("privacy.money")}>
            <Button variant="secondary" onPress={() => setExporting(true)}>
              <Text>{t("history.exportTitle")}</Text>
            </Button>
            <Text className={cn("text-muted-foreground px-1 text-xs leading-5", TEXT_START)}>{t("privacy.moneyBody")}</Text>
          </Section>
          <ExportSheet open={exporting} onClose={() => setExporting(false)} network={user?.activeNetwork ?? "testnet"} />
        </>
      )}
    </Page>
  );
}
