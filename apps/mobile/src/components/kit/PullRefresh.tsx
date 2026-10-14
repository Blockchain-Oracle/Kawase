import { type ReactElement, useCallback, useState } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";
import { fire } from "@/feedback/fire";
import { useTheme } from "./theme";

/**
 * Pull to refresh: one spinner and a `snap` as it arms, on every page. The spinner holds until the refetch settles.
 */
export function usePullRefresh(onRefresh: () => Promise<unknown> | undefined): ReactElement<RefreshControlProps> {
  const { color } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const run = useCallback(async () => {
    setRefreshing(true);
    fire("snap");
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void run()}
      tintColor={color.primary}
      colors={[color.primary]}
      progressBackgroundColor={color.card}
    />
  );
}
