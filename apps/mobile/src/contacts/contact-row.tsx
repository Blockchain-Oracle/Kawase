// One contact in a list (list-row grammar, revamp 10c): the authored avatar, the name with a "Business" chip when it
// is one, the @handle or the short address in mono (always left-to-right), and one trailing chip that says the most
// important thing about paying them: an address change on hold (payments are frozen), else "Paid before" on this
// network, else nothing. A chip carries words and an icon, never colour alone.
import { BadgeCheck, ChevronRight, Clock } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { Contact, NetworkId } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { shortAddress } from "@/activity/activity-row";
import { useT } from "@/i18n";

import { contactAddress, paidOn } from "./use-contacts";

const AVATAR = 44;
const ROW_MIN_HEIGHT = 64;
const SKELETON_NAME = 120;
const SKELETON_LINE = 90;

export function ContactRow({ contact, network, onPress }: { contact: Contact; network: NetworkId; onPress: () => void }) {
  const { t } = useT();
  const address = contactAddress(contact);
  const secondary = contact.handle ? `@${contact.handle}` : address ? shortAddress(address) : "";
  const onHold = Boolean(contact.pendingChange);
  const paid = !onHold && paidOn(contact, network);
  const chip = onHold ? t("send.onHold") : paid ? t("send.trustPaidBefore") : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[contact.displayName, secondary, chip].filter(Boolean).join(", ")}
      onPress={onPress}
      className="active:bg-muted flex-row items-center gap-3 px-4 py-3"
      style={{ minHeight: ROW_MIN_HEIGHT }}
    >
      <DefaultAvatar seed={(address ?? contact.displayName).toLowerCase()} size={AVATAR} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className={cn("text-foreground shrink text-base font-semibold", TEXT_START)}>
            {contact.displayName}
          </Text>
          {contact.kind === "business" ? (
            <View className="bg-muted rounded-full px-2 py-0.5">
              <Text className="text-muted-foreground text-xs font-semibold">{contact.label ?? t("contacts.business")}</Text>
            </View>
          ) : null}
        </View>
        {secondary ? (
          <Amount numberOfLines={1} className={cn("text-muted-foreground text-sm", TEXT_START)}>
            {secondary}
          </Amount>
        ) : null}
      </View>
      {chip ? (
        <View className={cn("flex-row items-center gap-1 rounded-full px-2.5 py-1", paid ? "bg-success/15" : "bg-muted")}>
          <Icon as={paid ? BadgeCheck : Clock} className={cn("size-3.5", paid ? "text-success" : "text-foreground")} />
          <Text className={cn("text-xs font-semibold", paid ? "text-success" : "text-foreground")}>{chip}</Text>
        </View>
      ) : null}
      <Icon as={ChevronRight} className="text-muted-foreground size-5 rtl:-scale-x-100" />
    </Pressable>
  );
}

/** A loading row with the real row's geometry, so nothing jumps when the contacts land. */
export function ContactRowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3" style={{ minHeight: ROW_MIN_HEIGHT }}>
      <Skeleton className="rounded-full" style={{ width: AVATAR, height: AVATAR }} />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 rounded-md" style={{ width: SKELETON_NAME }} />
        <Skeleton className="h-3 rounded-md" style={{ width: SKELETON_LINE }} />
      </View>
    </View>
  );
}
