import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";

import type { SplitView } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { Page } from "@/account/page";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { SplitCard } from "@/split/split-card";

/** `/split/<id>`: one split's progress — who has paid, each person's link. */
export default function SplitProgressRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const [split, setSplit] = React.useState<SplitView>();
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(() => {
    setFailed(false);
    api.splits
      .get(id ?? "")
      .then(({ split: found }) => setSplit(found))
      .catch(() => setFailed(true));
  }, [id]);
  React.useEffect(load, [load]);
  return (
    <Page title={t("split.title")}>
      {split ? (
        <SplitCard initial={split} framed={false} />
      ) : failed ? (
        <View className="items-center gap-3">
          <Text className="text-muted-foreground text-center">{t("split.failed")}</Text>
          <Button variant="secondary" onPress={load}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      ) : (
        <ActivityIndicator />
      )}
    </Page>
  );
}
