// A detail drawer held in the URL (`?d=<name>&id=<id>`, Senryo's drawer-param): on a desktop window the kit's Sheet
// is a right drawer beside the one stage, on a phone the same content rises as a sheet. `router.setParams` changes the
// URL without a new history entry or a remount (desktop docs pack §2), so a link opens the page with its drawer, and
// Escape, the scrim or the close plate leave it.
import { useGlobalSearchParams, useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, View } from "react-native";

import { SPACE } from "@/components/kit";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { useT } from "@/i18n";

export function useDrawer(name: string) {
  const router = useRouter();
  const params = useGlobalSearchParams<{ d?: string; id?: string }>();
  const open = params.d === name;
  const show = React.useCallback((id?: string) => router.setParams({ d: name, ...(id ? { id } : {}) }), [name, router]);
  const hide = React.useCallback(() => router.setParams({ d: undefined, id: undefined }), [router]);
  return { open, id: open ? params.id : undefined, show, hide };
}

export function DetailDrawer({ open, title, body, onClose, children }: { open: boolean; title: string; body?: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useT();
  if (!open) return null;
  return (
    <Sheet onClose={onClose} closeLabel={t("common.close")}>
      <View style={styles.body}>
        <SheetHeading title={title} {...(body ? { body } : {})} />
        {children}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ body: { gap: SPACE.lg } });
