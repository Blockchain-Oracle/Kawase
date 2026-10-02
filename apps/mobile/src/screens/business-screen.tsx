// Settings → Business (cards/agent-business.md): the business profile printed on invoices; invoices (open, partly
// paid, paid, overdue) with New invoice; and the doors to batch payouts and payroll. Chat can invoice too ("invoice Acme
// 500 USDC").
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarClock, FileText, Plus, Users } from "lucide-react-native";
import * as React from "react";
import { RefreshControl, View } from "react-native";
import { toast } from "sonner-native";

import type { BusinessProfile, InvoiceView } from "@kawase/api-client";
import { amount as toAmount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { Page, Section } from "@/account/page";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";

const SKELETON_HEIGHT = 120;

function ProfileForm({ initial, onSaved }: { initial: BusinessProfile | null; onSaved: (profile: BusinessProfile) => void }) {
  const { t } = useT();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [address, setAddress] = React.useState(initial?.address ?? "");
  const [taxId, setTaxId] = React.useState(initial?.taxId ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { profile } = await api.business.saveProfile({ name, address, taxId, email });
      onSaved(profile);
      toast(t("business.profileSaved"));
    } catch {
      toast(t("common.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="bg-card border-border gap-3 rounded-3xl border p-4">
      <Input value={name} onChangeText={setName} placeholder={t("business.name")} />
      <Input value={address} onChangeText={setAddress} placeholder={t("business.address")} />
      <Input value={taxId} onChangeText={setTaxId} placeholder={t("business.taxId")} autoCapitalize="characters" />
      <Input value={email} onChangeText={setEmail} placeholder={t("business.email")} keyboardType="email-address" autoCapitalize="none" />
      <Button disabled={busy || !name.trim()} onPress={() => void save()}>
        <Text>{busy ? t("common.loading") : t("business.saveProfile")}</Text>
      </Button>
    </View>
  );
}

export function useInvoiceStatus() {
  const { t } = useT();
  return (invoice: InvoiceView) => (invoice.overdue ? t("business.overdue") : t(`business.status.${invoice.status}`));
}

export function BusinessScreen() {
  const { t } = useT();
  const router = useRouter();
  const { locale } = useLocale();
  const status = useInvoiceStatus();
  const [profile, setProfile] = React.useState<BusinessProfile | null>();
  const [invoices, setInvoices] = React.useState<InvoiceView[]>();
  const [editing, setEditing] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [p, list] = await Promise.all([api.business.profile(), api.business.invoices()]);
      setProfile(p.profile);
      setInvoices(list.invoices);
    } catch {
      toast(t("common.error"));
    }
  }, [t]);
  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const money = (invoice: InvoiceView) => formatAmount(toAmount(invoice.asset as AssetId, BigInt(invoice.total)), locale);

  return (
    <Page
      title={t("business.title")}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      {profile === undefined ? (
        <Skeleton className="rounded-3xl" style={{ height: SKELETON_HEIGHT }} />
      ) : !profile || editing ? (
        <Section title={t("business.profile")}>
          {!profile ? <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{t("business.profileBody")}</Text> : null}
          <ProfileForm
            initial={profile}
            onSaved={(saved) => {
              setProfile(saved);
              setEditing(false);
            }}
          />
        </Section>
      ) : (
        <>
          <Section title={t("business.profile")}>
            <ListGroup>
              <ListRow title={profile.name} subtitle={[profile.address, profile.taxId, profile.email].filter(Boolean).join(" · ") || undefined} trailing={<Text className="text-primary text-sm font-semibold">{t("account.change")}</Text>} onPress={() => setEditing(true)} />
            </ListGroup>
          </Section>
          <Section title={t("business.invoices")}>
            <Button onPress={() => router.push("/business/invoice/new")}>
              <Icon as={Plus} className="text-primary-foreground size-4" />
              <Text>{t("business.newInvoice")}</Text>
            </Button>
            {invoices && invoices.length > 0 ? (
              <ListGroup>
                {invoices.map((invoice) => (
                  <ListRow
                    key={invoice.id}
                    leading={<Icon as={FileText} className="text-muted-foreground size-5" />}
                    title={`${invoice.number} · ${invoice.clientName}`}
                    subtitle={status(invoice)}
                    trailing={<Amount className={cn("text-sm font-semibold", invoice.status === "paid" ? "text-success" : "text-foreground")}>{money(invoice)}</Amount>}
                    chevron
                    onPress={() => router.push({ pathname: "/business/invoice/[id]", params: { id: invoice.id } })}
                  />
                ))}
              </ListGroup>
            ) : (
              <Text className={cn("text-muted-foreground px-1 text-sm", TEXT_START)}>{t("business.noInvoices")}</Text>
            )}
          </Section>
          <Section title={t("business.pay")}>
            <ListGroup>
              <ListRow leading={<Icon as={Users} className="text-muted-foreground size-5" />} title={t("business.payouts")} subtitle={t("business.payoutsBody")} chevron onPress={() => router.push("/business/payouts")} />
              <ListRow leading={<Icon as={CalendarClock} className="text-muted-foreground size-5" />} title={t("business.payroll")} subtitle={t("business.payrollBody")} chevron onPress={() => router.push("/business/payroll")} />
            </ListGroup>
          </Section>
        </>
      )}
    </Page>
  );
}
