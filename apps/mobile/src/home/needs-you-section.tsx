// Home's "Needs you" (surfaces.md Home §5; plan §D "Needs you (approvals waiting)"): the steps automations may not
// take alone, waiting for the person on this network, with their count. Shown only when something waits; each row
// says what and why and opens its answer; "See all" opens Activity's Needs-you filter.
import { useRouter } from "expo-router";
import { ArrowLeftRight } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";
import { useNeedsYouText } from "@/needs-you/needs-you-card";
import { useNeedsYou } from "@/needs-you/use-needs-you";
import { shortAddress } from "@/send/copy";
import { useSession } from "@/session/session-provider";

const SHOWN = 2;
const AVATAR = 36;

export function NeedsYouSection() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useSession();
  const { items, pending } = useNeedsYou();
  const text = useNeedsYouText();
  const network = user?.activeNetwork ?? "testnet";
  const waiting = (items ?? []).filter((item) => item.status === "pending" && item.network === network);
  if (pending === 0 || waiting.length === 0) return null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2 px-1">
          <Eyebrow>{t("needsYou.title")}</Eyebrow>
          <View className="bg-primary min-w-5 items-center rounded-full px-1.5">
            <Text className="text-primary-foreground text-xs font-bold">{String(pending)}</Text>
          </View>
        </View>
        {pending > SHOWN ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => router.navigate({ pathname: "/activity", params: { filter: "needs_you" } })}
          >
            <Text className="text-muted-foreground">{t("activity.seeAll")}</Text>
          </Button>
        ) : null}
      </View>
      <ListGroup>
        {waiting.slice(0, SHOWN).map((item) => {
          const request = item.request;
          return (
            <ListRow
              key={item.id}
              title={text.what(item)}
              subtitle={text.why(item)}
              leading={
                request.type === "send" ? (
                  <DefaultAvatar
                    seed={request.recipientAddress.toLowerCase()}
                    size={AVATAR}
                    label={request.name ?? shortAddress(request.recipientAddress)}
                  />
                ) : (
                  <View
                    className="bg-muted items-center justify-center rounded-full"
                    style={{ width: AVATAR, height: AVATAR }}
                  >
                    <Icon as={ArrowLeftRight} className="text-foreground size-4" />
                  </View>
                )
              }
              chevron
              onPress={() => router.push({ pathname: "/needs-you/[id]", params: { id: item.id, from: "home" } })}
            />
          );
        })}
      </ListGroup>
    </View>
  );
}
