// Blocked (Counterparts "Block"): who the person blocked — a Kawase user by @handle, or an address — each with
// Unblock. Shown under the contacts only when there is someone; blocking happens on a contact or on a request.
import { useFocusEffect } from "expo-router";
import { Ban } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { BlockView } from "@kawase/api-client";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { api } from "@/session/api";

export function BlockedList({ onChanged }: { onChanged?: (() => void) | undefined }) {
  const { t } = useT();
  const [blocks, setBlocks] = React.useState<BlockView[]>([]);
  useFocusEffect(
    React.useCallback(() => {
      api.blocks
        .list()
        .then(({ blocks: next }) => setBlocks(next))
        .catch(() => undefined);
    }, []),
  );
  const unblock = async (entry: BlockView) => {
    try {
      setBlocks((await api.blocks.remove(entry.id)).blocks);
      toast(t("contacts.unblockedToast", { name: entry.label }));
      onChanged?.();
    } catch {
      toast(t("common.error"));
    }
  };
  if (blocks.length === 0) return null;
  return (
    <View>
      <ListGroup label={t("contacts.blockedTitle")}>
        {blocks.map((entry) => (
          <ListRow
            key={entry.id}
            leading={<Icon as={Ban} className="text-muted-foreground size-5" />}
            title={entry.label}
            {...(entry.handle && `@${entry.handle}` !== entry.label ? { subtitle: `@${entry.handle}` } : {})}
            trailing={
              <Button size="sm" variant="secondary" onPress={() => void unblock(entry)}>
                <Text>{t("contacts.unblock")}</Text>
              </Button>
            }
          />
        ))}
      </ListGroup>
    </View>
  );
}
