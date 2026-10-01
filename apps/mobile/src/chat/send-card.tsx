// The send card (L, C1, T): what `propose_send` drafted, live. The tool's output is only where the card starts; it
// then follows the intent itself, so a conversation reopened tomorrow shows what really happened (sent, cancelled,
// expired) rather than the proposal it began as. Blocked → the blocker with its fix (add the contact, pick the
// currency, sign in), and the same send resumes; ready → the review and one Send button (Face ID above the
// allowance); moving or finished → the plane and the money ending. Nothing here is decided by the model.
import { useRouter } from "expo-router";
import { BookUser, ScanFace } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { ContactLine, ProposeSendOutput } from "@kawase/api-client";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AddContactSheet } from "@/contacts/add-contact-sheet";
import { useT } from "@/i18n";
import { recipientName, useMoney } from "@/send/copy";
import { SendBlocker } from "@/send/send-blocker";
import { SendReview } from "@/send/send-review";
import { SendStatus } from "@/send/send-status";
import { isOpen, useSend } from "@/send/use-send";

import { AgentCard } from "./card";

const AVATAR = 36;

export function SendCard({ output }: { output: ProposeSendOutput }) {
  const { t } = useT();
  const money = useMoney();
  const controller = useSend(output.intent);
  const [saving, setSaving] = React.useState(false);
  const intent = controller.intent ?? output.intent;
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("send.title")} · ${intent.network === "mainnet" ? t("network.realMoney") : networkName}`;
  const name = recipientName(intent.draft?.recipient, intent.request.recipient);

  if (!isOpen(intent)) {
    const unsavedAddress = intent.outcome === "sent" && intent.draft?.recipient.via === "address";
    return (
      <AgentCard eyebrow={eyebrow}>
        <SendStatus
          intent={intent}
          compact
          actions={
            unsavedAddress ? (
              <Button variant="secondary" onPress={() => setSaving(true)}>
                <Text>{t("send.saveContact")}</Text>
              </Button>
            ) : undefined
          }
        />
        {unsavedAddress ? (
          <AddContactSheet
            open={saving}
            onClose={() => setSaving(false)}
            initialAddress={intent.draft?.recipient.address}
            initialSource="pasted"
            onSaved={() => setSaving(false)}
          />
        ) : null}
      </AgentCard>
    );
  }

  const ready = !intent.blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
  const amountText = intent.draft ? money(intent.draft.asset, intent.draft.amount) : [intent.request.amount, intent.request.asset].filter(Boolean).join(" ");
  return (
    <AgentCard eyebrow={eyebrow}>
      {intent.draft ? (
        <SendReview intent={intent} compact />
      ) : (
        <Text className={cn("text-foreground font-display text-xl font-bold", TEXT_START)}>
          {[amountText, name].filter(Boolean).join(" → ")}
        </Text>
      )}
      <SendBlocker controller={controller} />
      {ready ? (
        <View className="gap-2">
          <Button
            size="lg"
            disabled={controller.busy}
            onPress={() => void controller.approve(t("send.signPrompt", { amount: amountText, name }))}
          >
            {intent.route === "wallet_signature" ? <Icon as={ScanFace} className="text-primary-foreground size-5" /> : null}
            <Text>{intent.route === "wallet_signature" ? t("send.sendFaceId") : t("send.sendNow")}</Text>
          </Button>
          <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
            <Text className="text-muted-foreground">{t("send.cancelSend")}</Text>
          </Button>
        </View>
      ) : (
        <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
          <Text className="text-muted-foreground">{t("send.cancelSend")}</Text>
        </Button>
      )}
    </AgentCard>
  );
}

/** `find_contacts`: who matched, and a way into the contacts page. Addresses are shown short; notes never. */
export function ContactsCard({ output }: { output: { contacts: ContactLine[] } }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <AgentCard eyebrow={t("chat.cardContacts")}>
      {output.contacts.length === 0 ? (
        <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("chat.noContactsFound")}</Text>
      ) : (
        output.contacts.map((contact) => (
          <ListRow
            key={`${contact.name}-${contact.address ?? ""}`}
            standalone
            leading={<DefaultAvatar seed={contact.name.toLowerCase()} size={AVATAR} label={contact.name} />}
            title={contact.name}
            subtitle={contact.onHold ? t("send.onHold") : contact.handle ? `@${contact.handle}` : (contact.address ?? "")}
            {...(contact.paidBefore ? { trailing: <Text className="text-success text-xs font-semibold">{t("send.trustPaidBefore")}</Text> } : {})}
          />
        ))
      )}
      <Button variant="secondary" onPress={() => router.push("/contacts")}>
        <Icon as={BookUser} className="size-4" />
        <Text>{t("contacts.title")}</Text>
      </Button>
    </AgentCard>
  );
}
