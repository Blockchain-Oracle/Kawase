// Request money (C3, revamp 10b; the fan's fourth action): how much and in which currency, an optional note for the
// payer, then the share card — link, QR, Copy, Share — whose status turns to "Paid" on its own when the money
// arrives (the api marks it from the send that paid it, or from a matching incoming transfer). "Your requests"
// lists them all with their status; open ones can be cancelled. `?id=` opens one request directly (from the inbox).
// Without an account or a wallet there is nothing to receive into, so the page says what to do instead.
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, List, Plus } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { PaymentRequest } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import type { AssetId } from "@kawase/money";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { RequestAmount } from "@/request/request-amount";
import { RequestRow } from "@/request/request-row";
import { RequestShareCard } from "@/request/request-share-card";
import { usePaymentRequest } from "@/request/use-payment-request";
import { shortAddress } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const ART_WIDTH = 150;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 56;

type Step = "amount" | "share" | "list";

export function RequestScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const params = useLocalSearchParams<{ id?: string }>();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const { wallet } = useWalletStatus();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";

  const [step, setStep] = React.useState<Step>(params.id ? "share" : "amount");
  const [asset, setAsset] = React.useState<AssetId>("USDC");
  const [value, setValue] = React.useState("");
  const [note, setNote] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [opened, setOpened] = React.useState<PaymentRequest>();
  const { request: current, setRequest } = usePaymentRequest(opened);
  const [list, setList] = React.useState<PaymentRequest[]>();
  const [listFailed, setListFailed] = React.useState(false);

  const requester = user?.handle ? `@${user.handle}` : wallet?.address ? shortAddress(wallet.address) : "";

  // Opened from the inbox: show that request.
  React.useEffect(() => {
    if (!params.id) return;
    void api.requests
      .get(params.id)
      .then(({ request }) => setOpened(request))
      .catch(() => setStep("list"));
  }, [params.id]);

  const loadList = React.useCallback(async () => {
    setListFailed(false);
    try {
      const { requests } = await api.requests.list();
      setList(requests);
    } catch {
      setListFailed(true);
    }
  }, []);
  React.useEffect(() => {
    if (step === "list") void loadList();
  }, [step, loadList]);

  const create = async () => {
    setCreating(true);
    try {
      const { request } = await api.requests.create({ amount: value, asset, note: note.trim() || null });
      setOpened(request);
      setStep("share");
      setValue("");
      setNote("");
    } catch {
      toast(t("send.failed"));
    } finally {
      setCreating(false);
    }
  };

  const cancel = async (id: string) => {
    setCancelling(true);
    try {
      const { request } = await api.requests.cancel(id);
      if (current?.id === id) setRequest(request);
      setList((rows) => rows?.map((row) => (row.id === id ? request : row)));
      toast(t("request.canceled"));
    } catch {
      toast(t("send.failed"));
    } finally {
      setCancelling(false);
    }
  };

  const back = () => {
    if (step === "amount" || (step === "share" && params.id)) {
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } else setStep("amount");
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text className="font-display text-foreground flex-1 text-2xl font-bold">
          {step === "list" ? t("request.yours") : t("request.title")}
        </Text>
        {status === "account" && wallet?.address ? (
          step === "list" ? (
            <Button variant="secondary" size="icon" accessibilityLabel={t("request.new")} className="size-11" onPress={() => setStep("amount")}>
              <Icon as={Plus} className="size-5" />
            </Button>
          ) : (
            <Button variant="secondary" size="icon" accessibilityLabel={t("request.yours")} className="size-11" onPress={() => setStep("list")}>
              <Icon as={List} className="size-5" />
            </Button>
          )
        ) : null}
      </View>
    </>
  );

  // Nothing to receive into yet: say what to do instead (like Receive).
  if (status !== "account" || !wallet?.address) {
    const account = status === "account";
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<Koban width={ART_WIDTH} />}
            title={account ? t("receive.setUpFirst") : t("request.signInTitle")}
            body={account ? t("receive.setUpFirstBody") : t("request.signInBody")}
            action={
              <Button onPress={() => (account ? router.push("/wallet") : signIn.open())}>
                <Text>{account ? t("wallet.setUp") : t("signIn.title")}</Text>
              </Button>
            }
          />
        </View>
      </View>
    );
  }

  const entering = reduced ? undefined : FadeIn.duration(MOTION.sheetMs);

  return (
    <View className="bg-background flex-1">
      {header}
      {step === "amount" ? (
        <Animated.View key="amount" entering={entering} className="flex-1">
          <RequestAmount
            network={network}
            asset={asset}
            onAsset={setAsset}
            value={value}
            onValue={setValue}
            note={note}
            onNote={setNote}
            onCreate={() => void create()}
            busy={creating}
          />
        </Animated.View>
      ) : step === "share" ? (
        <Animated.View key="share" entering={entering} className="flex-1">
          <ScrollView contentContainerClassName="gap-4 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
            {current ? (
              <RequestShareCard request={current} requester={requester} onCancel={() => void cancel(current.id)} cancelling={cancelling} />
            ) : (
              <Skeleton className="h-96 rounded-3xl" />
            )}
          </ScrollView>
        </Animated.View>
      ) : (
        <Animated.View key="list" entering={entering} className="flex-1">
          <ScrollView contentContainerClassName="gap-4 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
            {list === undefined && !listFailed ? (
              <View className="gap-2">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <Skeleton key={index} className="rounded-2xl" style={{ height: SKELETON_HEIGHT }} />
                ))}
              </View>
            ) : listFailed ? (
              <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
                <Text className={cn("text-muted-foreground flex-1 text-sm", TEXT_START)}>{t("request.loadFailed")}</Text>
                <Button size="sm" variant="secondary" onPress={() => void loadList()}>
                  <Text>{t("common.retry")}</Text>
                </Button>
              </View>
            ) : list && list.length > 0 ? (
              <ListGroup>
                {list.map((row) => (
                  <RequestRow
                    key={row.id}
                    request={row}
                    onPress={() => {
                      setOpened(row);
                      setStep("share");
                    }}
                    onCancel={() => void cancel(row.id)}
                  />
                ))}
              </ListGroup>
            ) : (
              <EmptyState
                art={<CoinStack width={ART_WIDTH} />}
                title={t("request.emptyTitle")}
                body={t("request.emptyBody")}
                action={
                  <Button onPress={() => setStep("amount")}>
                    <Text>{t("request.new")}</Text>
                  </Button>
                }
              />
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}
