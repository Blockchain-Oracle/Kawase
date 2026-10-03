// Contacts → My places (surfaces.md "Contacts: segmented People · My places"): the exchanges and own wallets the
// person takes money out to, saved by Withdraw or added here, each with its real mark, chain and short address.
// A place opens its sheet (rename, withdraw there, forget). Loading, empty and error states are drawn.
import { useFocusEffect } from "expo-router";
import { Plus } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ExchangeView, PlaceView } from "@kawase/api-client";
import { chainKey, exchangeKey, walletKey } from "@kawase/identity";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";
import { api } from "@/session/api";
import { useDestinationName } from "@/withdraw/copy";

import { PlaceSheet } from "./place-sheet";

const ROW_MARK = 36;
const ART_WIDTH = 160;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 64;
const BOTTOM_GAP = 16;

export const placeMark = (place: Pick<PlaceView, "kind" | "brand" | "chain">) =>
  place.kind === "exchange" && place.brand ? exchangeKey(place.brand) : place.brand ? walletKey(place.brand) : place.chain.chainId ? chainKey(place.chain.chainId) : "";

export function PlacesTab({ network }: { network: string }) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const name = useDestinationName();
  const [places, setPlaces] = React.useState<PlaceView[]>();
  const [failed, setFailed] = React.useState(false);
  const [exchanges, setExchanges] = React.useState<ExchangeView[]>([]);
  const [chains, setChains] = React.useState<{ key: string; name: string; chainId: number | null }[]>([]);
  const [editing, setEditing] = React.useState<PlaceView | "new" | undefined>();

  const load = React.useCallback(async () => {
    try {
      setPlaces((await api.places.list()).places);
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
  React.useEffect(() => {
    void load();
    void api.withdrawals.exchanges().then((result) => setExchanges(result.exchanges)).catch(() => undefined);
    void api.withdrawals.chains().then((result) => setChains(result.chains)).catch(() => undefined);
  }, [load, network]);

  let body: React.ReactNode;
  if (!places && !failed) {
    body = (
      <View className="gap-2 px-5 pt-5">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
        ))}
      </View>
    );
  } else if (!places) {
    body = (
      <EmptyState
        art={<CoinStack width={ART_WIDTH} />}
        title={t("places.loadFailed")}
        action={
          <Button variant="secondary" onPress={() => void load()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        }
      />
    );
  } else if (places.length === 0) {
    body = (
      <EmptyState
        art={<CoinStack width={ART_WIDTH} />}
        title={t("places.emptyTitle")}
        body={t("places.emptyBody")}
        action={
          <Button onPress={() => setEditing("new")}>
            <Icon as={Plus} className="text-primary-foreground size-4" />
            <Text>{t("places.add")}</Text>
          </Button>
        }
      />
    );
  } else {
    body = (
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_GAP }}>
        <ListGroup>
          {places.map((place) => (
            <ListRow
              key={place.id}
              leading={placeMark(place) ? <Mark entity={placeMark(place)} size={ROW_MARK} /> : undefined}
              title={name(place)}
              subtitle={`${place.chain.name} · ${shortAddress(place.address)}`}
              chevron
              onPress={() => setEditing(place)}
            />
          ))}
        </ListGroup>
        <Button variant="secondary" onPress={() => setEditing("new")}>
          <Icon as={Plus} className="size-4" />
          <Text>{t("places.add")}</Text>
        </Button>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1">
      {body}
      <PlaceSheet
        open={editing !== undefined}
        place={editing === "new" ? undefined : editing}
        exchanges={exchanges}
        chains={chains}
        onClose={() => setEditing(undefined)}
        onChanged={() => void load()}
      />
    </View>
  );
}
