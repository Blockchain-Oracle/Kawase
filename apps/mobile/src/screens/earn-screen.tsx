// Earn (Stage 6c), on the Senryo kit. What the person holds in vaults and what each vault pays → how much in or out →
// review → moving → the ending. The overview leads with their position as the one hero figure (or, before they have
// one, what their USDC could earn), then the vaults with their real marks, yield now, curator, Circle's monitoring and
// liquidity. Choosing a vault opens the amount (Deposit, or Withdraw when they hold some there), then the review with
// the tx kit's CTA (the fix when blocked, the press named after the device's real check, Signing → Sent → Confirmed,
// the receipt in place, a failure card that says whether money moved). The asset chip (R1) earns on any held asset.
// Phone: overview → amount → review, crossfading under one header. Desktop: two columns, the overview as the stage
// and the ticket beside it with the best vault preselected; "About this vault" opens the right drawer (?d=vault).
// States: guests sign in; loading is the list's shape, held; a failed read says what still works; no open vault says
// why and offers the other ways to earn.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { toast } from "sonner-native";

import type { EarnVaultView, PolicyResultView } from "@kawase/api-client";
import { decimalsOf } from "@kawase/money";
import { arcIdentity, providerKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { useWide } from "@kawase/ui-native/lib/wide";

import { BlockedCta } from "@/components/tx";
import { Button, DisclosureRow, EmptyState, ErrorState, KeyValue, ListRow, LoadingState, Panel, RADIUS, SectionLabel, Segmented, SIZE, SPACE, TIMING, TYPE, useHeldLoading, useTheme } from "@/components/kit";
import { ChevronDown, Icon, LineChart } from "@/components/kit/icons";
import { AutoSaveCard } from "@/earn/auto-save-card";
import { useEarnApproveLabel, useEarnPolicyText, useEarnPrompt, usePercent } from "@/earn/copy";
import { EarnReview } from "@/earn/earn-review";
import { useEarn } from "@/earn/use-earn";
import { useEarnOverview } from "@/earn/use-earn-overview";
import { VaultRow } from "@/earn/vault-row";
import { vaultTitle } from "@/earn/vault-title";
import { fire } from "@/feedback/fire";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving, isIntentOpen } from "@/intents/use-wallet-intent";
import { useYieldOptions } from "@/lend/use-lend";
import { useChooseYield, YieldOptionRow } from "@/lend/yield-options";
import { AssetPickerSheet } from "@/portfolio/asset-picker-sheet";
import { stableToken, type TicketToken } from "@/portfolio/ticket-token";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { LiveNumber, RealMoney } from "@/trade/bits";
import { DetailDrawer, useDrawer } from "@/trade/drawer";
import { IntentCta, openExplorer, type CtaBlocker } from "@/trade/intent-cta";
import { Columns, PageHeader, PhoneScroll } from "@/trade/page-frame";
import { TicketAmount } from "@/trade/ticket-amount";
import { useWalletStatus } from "@/wallet/use-wallet-status";
import { RehearsalBlock, rehearsalBlocker, useRehearsal } from "@/chat/rehearsal";

const MARK = 32;
const HERO_H = 52;
const ZERO = 0n;
const USDC_UNIT = 1_000_000;

type Step = "overview" | "amount" | "review";
type Action = "deposit" | "withdraw";

/** `/earn?vault=0x…&amount=20` (the yield options card) opens that vault's deposit ticket. */
export type EarnPrefill = { vault?: string | undefined; amount?: string | undefined; token?: TicketToken | undefined };

export function EarnScreen({ prefill = {} }: { prefill?: EarnPrefill }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const wide = useWide();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const { wallet } = useWalletStatus();
  const overview = useEarnOverview();
  const controller = useEarn();
  const money = useMoney();
  const percent = usePercent();
  const policyText = useEarnPolicyText();
  const approveLabel = useEarnApproveLabel();
  const prompt = useEarnPrompt();
  const drawer = useDrawer("vault");
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const loading = useHeldLoading(status === "account" && !overview.vaults && !overview.failed);

  const [step, setStep] = React.useState<Step>("overview");
  const [vault, setVault] = React.useState<EarnVaultView>();
  const [action, setAction] = React.useState<Action>("deposit");
  const [value, setValue] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const usdc = wallet?.networks[network] ? BigInt(wallet.networks[network]!.usdcBalance) : undefined;
  // Vaults that could not give a deposit back now are not offered (gaps.md G1); positions in them stay listed above.
  const depositable = (overview.vaults ?? []).filter((entry) => entry.liquidity !== "stuck");
  const stuckCount = (overview.vaults?.length ?? 0) - depositable.length;
  const position = vault ? overview.positions.find((entry) => entry.vault.toLowerCase() === vault.address.toLowerCase()) : undefined;
  const intent = controller.intent;
  // Simulated before the confirm, like every move of money (a revert stops it here, in the chain's own words).
  const rehearsable = Boolean(intent && !intent.blocking && intent.draft && intent.state === "ready_for_approval");
  const rehearsal = useRehearsal("earn", intent ?? { id: "", version: 0 }, rehearsable);
  const settled = intent && (isIntentMoving(intent) || isIntentFinished(intent));
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const toOverview = () => {
    void overview.refresh();
    controller.reset();
    setStep(wide ? "amount" : "overview");
  };
  const back = () => {
    if (wide) return leave();
    if (settled) return toOverview();
    if (step === "overview") return leave();
    setStep(step === "review" ? "amount" : "overview");
  };

  const choose = React.useCallback(
    (next: EarnVaultView, nextAction: Action) => {
      if (intent && isIntentOpen(intent)) void controller.cancel();
      controller.reset();
      setVault(next);
      setAction(nextAction);
      setValue("");
      setStep("amount");
    },
    [controller, intent],
  );

  // The asset to earn on (R1): USDC by default; any held asset from the universal picker.
  const [earnToken, setEarnToken] = React.useState<TicketToken>(() => prefill.token ?? stableToken(network, "USDC"));
  const [picking, setPicking] = React.useState(false);
  const onUsdc = earnToken.address.toLowerCase() === stableToken(network, "USDC").address.toLowerCase();
  // Other places it earns (Aave V4, Morpho, LP campaigns as advanced); for USDC beside the vaults. Each opens its ticket.
  const others = useYieldOptions(earnToken.symbol);
  const chooseYield = useChooseYield();
  const elsewhere = (others.view?.options ?? []).filter((option) => !onUsdc || option.kind !== "morpho_vault");

  // A link names a vault (and an amount); on a desktop window the best vault is preselected so the ticket is never empty.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current || !overview.vaults) return;
    const wanted = prefill.vault ? overview.vaults.find((entry) => entry.address.toLowerCase() === prefill.vault!.toLowerCase()) : undefined;
    const pick = wanted && wanted.liquidity !== "stuck" ? wanted : wide ? (overview.best ?? depositable[0]) : undefined;
    if (!pick) return;
    prefilled.current = true;
    choose(pick, "deposit");
    if (wanted && prefill.amount) setValue(prefill.amount);
  }, [overview.vaults, wide]);

  const review = async () => {
    if (!vault) return;
    const request = { action, vault: vault.address, amount: value };
    setCreating(true);
    try {
      if (intent && isIntentOpen(intent)) {
        const next = await controller.revise(request);
        if (next) setStep("review");
      } else {
        const { intent: fresh } = await api.earn.create(request);
        controller.set(fresh);
        setStep("review");
      }
    } catch {
      toast(t("send.failed"));
    } finally {
      setCreating(false);
    }
  };

  const fixFor = (blocking: PolicyResultView, network: "mainnet" | "testnet"): CtaBlocker => {
    const reason = policyText(blocking, network);
    switch (blocking.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), reason, onFix: () => signIn.open() };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), reason, onFix: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), reason, onFix: () => router.push("/wallet") };
      case "AMOUNT_MISSING":
      case "AMOUNT_INVALID":
      case "OVER_POSITION":
      case "VAULT_LIQUIDITY_SHORT":
        return { label: t("policy.fixEditAmount"), reason, onFix: () => setStep("amount") };
      default:
        return { label: reason };
    }
  };

  const header = <PageHeader title={t("earn.title")} onBack={back} />;

  // Without an account or a wallet there is nothing to earn with; say what to do instead.
  const blockedPage =
    status !== "account"
      ? { title: t("earnPolicy.SIGN_IN_REQUIRED"), action: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : wallet && !wallet.address
        ? { title: t("earnPolicy.WALLET_NOT_READY"), action: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
        : undefined;
  if (blockedPage) {
    return (
      <View style={styles.page}>
        {header}
        <View style={styles.plain}>
          <EmptyState size="page" icon={LineChart} why={blockedPage.title} action={{ label: blockedPage.action, onPress: blockedPage.onPress }} />
        </View>
      </View>
    );
  }

  // The ticket: the amount for the chosen vault, or its review and lifecycle once drafted.
  let ticket: React.ReactNode = null;
  if ((step === "review" || settled) && intent) {
    const draftAction = intent.draft?.action ?? action;
    const blocker = intent.blocking && !isIntentMoving(intent) && !isIntentFinished(intent) ? fixFor(intent.blocking, intent.network) : !intent.draft ? { label: t("desktop.pricing"), busy: true } : null;
    const receipt = (
      <Panel style={styles.receipt}>
        <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{draftAction === "deposit" ? t("desktop.depositedTitle") : t("desktop.withdrawnTitle")}</Text>
        {intent.received ? <KeyValue label={draftAction === "deposit" ? t("earn.inVaults") : t("desktop.cameBack")} value={money("USDC", intent.received)} /> : null}
        <Button label={t("send.done")} onPress={toOverview} />
        {intent.tx ? <Button label={t("desktop.explorer")} variant="ghost" onPress={() => openExplorer(intent.tx?.explorerUrl)} /> : null}
      </Panel>
    );
    ticket = (
      <View style={styles.group}>
        {!testnet && !isIntentFinished(intent) ? <RealMoney /> : null}
        <EarnReview intent={intent} />
        {rehearsable && intent ? <RehearsalBlock control={rehearsal} network={intent.network} /> : null}
        <IntentCta
          intent={intent}
          busy={controller.busy}
          connectionLost={controller.connectionLost}
          blocker={blocker ?? rehearsalBlocker(rehearsal, { running: t("feed.run.rehearsing"), stopped: t("feed.run.rehearsedStopped") })}
          confirm={{ kind: "press", label: approveLabel(draftAction) }}
          onConfirm={() => void controller.approve(prompt(intent.draft))}
          onRetry={() => setStep("amount")}
          receipt={receipt}
          journal={{ what: prompt(intent.draft), kind: "earn", network: intent.network, owner: wallet?.address }}
        />
        {isIntentOpen(intent) ? (
          <Button
            label={t("earn.cancel")}
            variant="ghost"
            disabled={controller.busy}
            onPress={() => {
              void controller.cancel();
              setStep(wide ? "amount" : "overview");
            }}
          />
        ) : null}
      </View>
    );
  } else if (step === "amount" && vault) {
    const limit = action === "deposit" ? usdc : position ? BigInt(position.assets) : ZERO;
    const units = Number(value || 0) * USDC_UNIT;
    ticket = (
      <View style={styles.group}>
        {position ? (
          <Segmented<Action>
            label={t("earn.title")}
            value={action}
            onChange={(next) => {
              setAction(next);
              setValue("");
            }}
            options={[
              { value: "deposit", label: t("earn.deposit") },
              { value: "withdraw", label: t("earn.withdraw") },
            ]}
          />
        ) : null}
        <Panel>
          <VaultRow vault={vault} network={network} />
        </Panel>
        <Button label={t("desktop.aboutVault")} variant="ghost" size="sm" onPress={() => drawer.show(vault.address)} />
        <TicketAmount
          label={action === "deposit" ? t("earn.youPutIn") : t("earn.youTakeOut")}
          value={value}
          onChange={setValue}
          decimals={decimalsOf("USDC")}
          balance={limit}
          note={limit !== undefined ? t("send.available", { amount: money("USDC", limit.toString()) }) : undefined}
        />
        {units <= 0 ? (
          <BlockedCta blocker={{ label: t("send.enterAmount") }} />
        ) : limit !== undefined && BigInt(Math.round(units)) > limit ? (
          action === "deposit" ? (
            <BlockedCta blocker={{ label: t("policy.fixAddMoney"), reason: t("send.notEnough", { asset: "USDC" }), fix: { kind: "add-money" } }} onFix={fund.open} />
          ) : (
            <BlockedCta blocker={{ label: t("send.notEnough", { asset: "USDC" }) }} />
          )
        ) : (
          <Button label={creating ? t("common.loading") : t("earn.review")} loading={creating || controller.busy} onPress={() => void review()} />
        )}
      </View>
    );
  }

  const held = overview.held;
  const stage = (
    <>
      <View style={styles.hero}>
        {held > ZERO ? (
          <>
            <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("earn.inVaults")}</Text>
            <LiveNumber text={money("USDC", held.toString())} value={Number(held) / USDC_UNIT} height={HERO_H} sensitive />
          </>
        ) : (
          <Text style={[TYPE.pageTitle, { color: color.ink }]}>{overview.best ? t("earn.heroTitle", { apy: percent(overview.best.apy) }) : t("earn.title")}</Text>
        )}
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("earn.heroBody")}</Text>
        {testnet ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("earn.testnetVaults")}</Text> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("earn.earnOn")}: ${earnToken.symbol}`}
        onPress={() => {
          fire("tick");
          setPicking(true);
        }}
        style={[styles.assetChip, { backgroundColor: color.raised2 }]}
      >
        <TokenMark token={earnToken} size={MARK} />
        <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("earn.earnOnAsset", { asset: earnToken.symbol })}</Text>
        <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} />
      </Pressable>

      {onUsdc ? <AutoSaveCard /> : null}

      {onUsdc && overview.positions.length > 0 ? (
        <View style={styles.group}>
          <SectionLabel>{t("earn.yourPosition")}</SectionLabel>
          <Panel>
            {overview.positions.map((entry) => {
              const listed = overview.vaults?.find((candidate) => candidate.address.toLowerCase() === entry.vault.toLowerCase());
              return (
                <ListRow
                  key={entry.vault}
                  title={vaultTitle(entry.name)}
                  detail={t("earn.earningAbout", { apy: percent(entry.apy) })}
                  trailing={<Text style={[TYPE.rowAmount, { color: color.ink }]}>{money("USDC", entry.assets)}</Text>}
                  {...(listed ? { onPress: () => choose(listed, "withdraw") } : {})}
                />
              );
            })}
          </Panel>
        </View>
      ) : null}

      {onUsdc ? (
        <View style={styles.group}>
          <SectionLabel>{t("earn.vaults")}</SectionLabel>
          {overview.failed && !overview.vaults ? (
            <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void overview.refresh()} stillWorks={t("earn.loadFailed")} />
          ) : !overview.vaults ? (
            loading ? <LoadingState shape="list" /> : null
          ) : depositable.length === 0 ? (
            <EmptyState why={t("earn.noVaults")} detail={elsewhere.length > 0 ? t("desktop.noVaultsOther") : undefined} />
          ) : (
            <>
              <Panel>
                {depositable.map((entry) => (
                  <VaultRow key={entry.address} vault={entry} network={network} selected={wide && vault?.address === entry.address} onPress={() => choose(entry, "deposit")} />
                ))}
              </Panel>
              {stuckCount > 0 ? <Text style={[TYPE.caption, { color: color.text3 }]}>{t("earn.stuckHidden", { count: stuckCount })}</Text> : null}
            </>
          )}
        </View>
      ) : null}

      {!onUsdc && others.view && elsewhere.length === 0 ? <EmptyState why={t("yieldOptions.none", { asset: earnToken.symbol })} /> : null}
      {!onUsdc && !others.view && !others.failed ? <LoadingState shape="row" /> : null}
      {!onUsdc && !others.view && others.failed ? <ErrorState diagnosis={{ kind: "server", retryable: true }} retry={() => void others.refresh()} /> : null}

      {elsewhere.length > 0 ? (
        <View style={styles.group}>
          <SectionLabel>{onUsdc ? t("yieldOptions.moreWays") : t("earn.waysFor", { asset: earnToken.symbol })}</SectionLabel>
          <Panel>
            {elsewhere.map((option) => (
              <YieldOptionRow key={option.id} option={option} best={false} onPress={option.executable ? () => chooseYield(option, null) : undefined} />
            ))}
          </Panel>
        </View>
      ) : null}

      {!testnet ? (
        <Panel>
          <ListRow title={t("lend.borrowTitle")} detail={t("lend.borrowEntry")} leading={<Mark entity="provider:aave" size={MARK} />} onPress={() => router.push("/borrow")} />
          <ListRow title={t("lp.title")} detail={t("lp.entry")} leading={<Mark entity={providerKey("aero")} size={MARK} />} onPress={() => router.push("/lp")} />
        </Panel>
      ) : null}
    </>
  );

  const drawerVault = overview.vaults?.find((entry) => entry.address.toLowerCase() === drawer.id?.toLowerCase());
  const picker = (
    <AssetPickerSheet
      open={picking}
      onClose={() => setPicking(false)}
      title={t("earn.earnOn")}
      mode="held"
      selected={earnToken.address.toLowerCase()}
      onSelect={({ token }) => {
        setPicking(false);
        setEarnToken(token);
      }}
      unavailable={(token) => (token.kind === "permissioned" ? t("tokenPage.n_permissioned") : token.kind === "position" ? t("earn.alreadyEarning") : undefined)}
    />
  );
  const vaultDrawer = (
    <DetailDrawer open={drawer.open} title={drawerVault ? vaultTitle(drawerVault.name) : t("earn.vaults")} onClose={drawer.hide}>
      {drawerVault ? (
        <VaultFacts
          vault={drawerVault}
          network={network}
          onDeposit={() => {
            choose(drawerVault, "deposit");
            drawer.hide();
          }}
        />
      ) : overview.vaults ? (
        <EmptyState why={t("desktop.vaultGone")} />
      ) : (
        <LoadingState shape="detail" />
      )}
    </DetailDrawer>
  );

  if (wide) {
    return (
      <View style={styles.page}>
        {header}
        <Columns stage={stage} ticket={ticket ?? (overview.vaults && depositable.length === 0 ? <EmptyState why={t("earn.noVaults")} /> : <LoadingState shape="detail" />)} />
        {picker}
        {vaultDrawer}
      </View>
    );
  }
  const visible: Step | "status" = settled ? "status" : step;
  return (
    <View style={styles.page}>
      {header}
      <Animated.View key={visible} entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} exiting={reduced ? undefined : FadeOut.duration(TIMING.sheetExit)} style={styles.page}>
        <PhoneScroll>{ticket ?? stage}</PhoneScroll>
      </Animated.View>
      {picker}
      {vaultDrawer}
    </View>
  );
}

/** A vault in full (the drawer): its mark, yield now and over 30 days, deposits, what can come out now, curator, monitoring. */
function VaultFacts({ vault, network, onDeposit }: { vault: EarnVaultView; network: "mainnet" | "testnet"; onDeposit: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const percent = usePercent();
  const money = useMoney();
  const ids = arcIdentity(network);
  return (
    <View style={styles.group}>
      <Panel>
        <VaultRow vault={vault} network={network} />
      </Panel>
      <Panel style={styles.facts}>
        <KeyValue label={t("desktop.vaultApy")} value={percent(vault.apy)} />
        {vault.apy30d !== null ? <KeyValue label={t("desktop.vaultApy30")} value={percent(vault.apy30d)} /> : null}
        <KeyValue label={t("desktop.vaultDeposits")} value={money("USDC", vault.totalDeposits)} />
        <KeyValue label={t("desktop.vaultAvailable")} value={money("USDC", vault.available)} />
        {vault.curator ? <KeyValue label={t("desktop.vaultCurator")} value={vault.curator} /> : null}
        <KeyValue label={t("desktop.vaultMonitor")} value={vault.circleGuarded ? t("desktop.vaultGuarded") : t("desktop.vaultNotGuarded")} />
      </Panel>
      {vault.warnings.length > 0 ? (
        <DisclosureRow title={t("desktop.vaultWarnings")} value={String(vault.warnings.length)}>
          {vault.warnings.map((warning) => (
            <Text key={warning} style={[TYPE.rowDetail, { color: color.text2 }]}>
              {warning}
            </Text>
          ))}
        </DisclosureRow>
      ) : null}
      <View style={styles.markRow}>
        <Mark entity={ids.usdc} chainBadge={ids.chain} size={MARK} />
        <View style={styles.grow}>
          <Button label={t("earn.deposit")} onPress={onDeposit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  plain: { flex: 1, paddingHorizontal: SPACE.inset, paddingTop: SPACE.lg },
  group: { gap: SPACE.md },
  hero: { gap: SPACE.xs },
  assetChip: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, alignSelf: "flex-start", borderRadius: RADIUS.pill, paddingVertical: SPACE.xs, paddingStart: SPACE.xs, paddingEnd: SPACE.md },
  receipt: { gap: SPACE.md, padding: SPACE.lg },
  facts: { gap: SPACE.xs, padding: SPACE.lg },
  markRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1 },
});
