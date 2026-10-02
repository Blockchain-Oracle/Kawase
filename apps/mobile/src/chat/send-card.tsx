// The send card (L, C1, T): what `propose_send` drafted, live. The tool's output is only where the card starts; it
// then follows the intent itself, so a conversation reopened tomorrow shows what really happened (sent, cancelled,
// expired) rather than the proposal it began as. Inside the allowance the request already went (D33: no prompt;
// the api approved it as it was proposed), so the card opens on the plane. Blocked → the blocker with its fix (add
// the contact, pick the currency, sign in); after a fix the person made here, the same request carries on by itself
// when it lands inside the allowance, and waits for Send with Face ID above it. Nothing here is decided by the model.
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
import { recipientName, useApproveLabel, useMoney } from "@/send/copy";
import { SendBlocker } from "@/send/send-blocker";
import { SendReview } from "@/send/send-review";
import { SendStatus } from "@/send/send-status";
import { isOpen, useSend, type SendController } from "@/send/use-send";

import { useResumeWhenFixed } from "@/intents/use-resume";
import { ShareReceiptButton } from "@/receipt/share-receipt";

import { AgentCard } from "./card";

const AVATAR = 36;

export function SendCard({ output }: { output: ProposeSendOutput }) {
  const { t } = useT();
  const router = useRouter();
  const money = useMoney();
  const controller = useSend(output.intent);
  const approveLabel = useApproveLabel();
  const [saving, setSaving] = React.useState(false);
  const intent = controller.intent ?? output.intent;
  // A fix made on this card (a saved contact, a chosen currency, a sign-in) resumes the person's original request.
  const fixedHere = React.useRef(false);
  const fixing: SendController = React.useMemo(
    () => ({
      ...controller,
      revise: (patch) => {
        fixedHere.current = true;
        return controller.revise(patch);
      },
      set: (next) => {
        fixedHere.current = true;
        controller.set(next);
      },
    }),
    [controller],
  );
  const networkName = intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const eyebrow = `${t("send.title")} · ${intent.network === "mainnet" ? t("network.realMoney") : networkName}`;
  const name = recipientName(intent.draft?.recipient, intent.request.recipient);
  const readyInside = !intent.blocking && intent.state === "ready_for_approval" && intent.route === "allowance";
  const amountLine = intent.draft ? money(intent.draft.asset, intent.draft.amount, intent.draft.token?.decimals) : "";
  React.useEffect(() => {
    if (!fixedHere.current || !readyInside || controller.busy) return;
    fixedHere.current = false;
    void controller.approve(t("send.signPrompt", { amount: amountLine, name }));
  }, [readyInside, intent.version]); // runs when a new version lands
  // Back from wallet setup, Wallet & limits or adding money: the same send is checked again (sign-in is the
  // blocker's own). Above the allowance it then waits for the tap; inside it, it was the person's instruction.
  useResumeWhenFixed(isOpen(intent) ? intent.blocking?.code : undefined, () => void controller.revise({}), { signIn: false });
  const overLimit = Boolean(intent.blocking?.code.startsWith("OVER_"));

  if (!isOpen(intent)) {
    const unsavedAddress = intent.outcome === "sent" && intent.draft?.recipient.via === "address";
    return (
      <AgentCard eyebrow={eyebrow}>
        <SendStatus
          intent={intent}
          compact
          connectionLost={controller.connectionLost}
          actions={
            unsavedAddress || (intent.outcome === "sent" && intent.tx && intent.draft) ? (
              <View className="gap-2">
                {unsavedAddress ? (
                  <Button variant="secondary" onPress={() => setSaving(true)}>
                    <Text>{t("send.saveContact")}</Text>
                  </Button>
                ) : null}
                {intent.outcome === "sent" && intent.tx && intent.draft ? (
                  <ShareReceiptButton
                    variant="ghost"
                    receipt={{
                      direction: "sent",
                      amount: money(intent.draft.asset, intent.draft.amount),
                      counterparty: name,
                      network: intent.network,
                      at: intent.completedAt ?? intent.createdAt,
                      txHash: intent.tx.hash,
                      explorerUrl: intent.tx.explorerUrl,
                      note: intent.request.note,
                    }}
                  />
                ) : null}
              </View>
            ) : undefined
          }
        />
        {unsavedAddress ? (
          <AddContactSheet
            open={saving}
            onClose={() => setSaving(false)}
            initialAddress={intent.draft?.recipient.address}
            // The address came from the person's own chat message; say so rather than claim it was pasted.
            initialSource={intent.draft?.recipient.source ?? "agent"}
            onSaved={() => setSaving(false)}
          />
        ) : null}
      </AgentCard>
    );
  }

  const ready = !intent.blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
  const amountText = intent.draft ? money(intent.draft.asset, intent.draft.amount, intent.draft.token?.decimals) : [intent.request.amount, intent.request.asset].filter(Boolean).join(" ");
  return (
    <AgentCard eyebrow={eyebrow}>
      {intent.draft ? (
        <SendReview intent={intent} compact />
      ) : (
        <Text className={cn("text-foreground font-display text-xl font-bold", TEXT_START)}>
          {[amountText, name].filter(Boolean).join(" → ")}
        </Text>
      )}
      <SendBlocker controller={fixing} recheckAfterSignIn={() => void controller.revise({})} />
      {overLimit ? (
        <Button variant="secondary" onPress={() => router.push("/limits")}>
          <Text>{t("resume.seeLimits")}</Text>
        </Button>
      ) : null}
      {ready ? (
        <View className="gap-2">
          <Button
            size="lg"
            disabled={controller.busy}
            onPress={() => void controller.approve(t("send.signPrompt", { amount: amountText, name }))}
          >
            {intent.route === "wallet_signature" ? <Icon as={ScanFace} className="text-primary-foreground size-5" /> : null}
            <Text>{intent.route === "wallet_signature" ? approveLabel : t("send.sendNow")}</Text>
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
