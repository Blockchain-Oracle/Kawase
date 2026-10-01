// Internal gallery (web): every base component in light, dark, testnet and Arabic right-to-left.
import { tokens } from "@kawase/ui-tokens";
import { Composer } from "@kawase/ui-web/components/composer";
import { ConfirmSheet } from "@kawase/ui-web/components/confirm-sheet";
import { NetworkChip, TestnetStrip } from "@kawase/ui-web/components/network-chip";
import { StateLabel } from "@kawase/ui-web/components/state-label";
import { Bubble, BubbleContent } from "@kawase/ui-web/components/ui/bubble";
import { Button } from "@kawase/ui-web/components/ui/button";
import { HoldToConfirm } from "@kawase/ui-web/components/ui/hold-to-confirm";
import { ActivityFeed } from "@kawase/ui-web/components/ui/item-19";
import { ReceiptCard } from "@kawase/ui-web/components/ui/order-confirmation-card";
import { ResponseStream } from "@kawase/ui-web/components/ui/response-stream";
import { SegmentedControl } from "@kawase/ui-web/components/ui/segmented-control";
import { AiSuggestedActions } from "@kawase/ui-web/components/ui/suggested-actions";
import { VoicePoweredOrb } from "@kawase/ui-web/components/ui/voice-powered-orb";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ScanFace,
} from "lucide-react";
import * as React from "react";

import { SAMPLE, SAMPLE_ADDRESS, type SampleLocale } from "@/gallery/sample";
import { useTheme, type Mode, type Network } from "@/theme/theme-provider";

const EVENT_ICONS = { a: ArrowUpRight, b: ArrowDownLeft, c: CalendarClock } as const;
const ORB_LEVELS = { quiet: 0, speaking: 0.6 } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

type GalleryScreenProps = {
  initialLocale?: SampleLocale;
  /** Used by the native gallery only; the web page is captured whole. */
  initialScroll?: number;
};

export function GalleryScreen({ initialLocale = "en" }: GalleryScreenProps) {
  const { mode, network, setMode, setNetwork } = useTheme();
  const [locale, setLocale] = React.useState<SampleLocale>(initialLocale);
  const [orb, setOrb] = React.useState<keyof typeof ORB_LEVELS>("speaking");
  const [message, setMessage] = React.useState("");
  const [log, setLog] = React.useState("");
  const t = SAMPLE[locale];
  const testnet = network === "testnet";

  return (
    // The app shell does not scroll on web, so the page is its own scroll container.
    <div data-gallery-scroll className="bg-background text-foreground h-dvh overflow-y-auto font-sans">
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-8 px-4 pb-16 pt-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-semibold">Gallery</h1>
          <div className="flex flex-wrap gap-2">
            <SegmentedControl
              label="Mode"
              value={mode}
              onValueChange={(value) => setMode(value as Mode)}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
            <SegmentedControl
              label="Network"
              value={network}
              onValueChange={(value) => setNetwork(value as Network)}
              options={[
                { value: "mainnet", label: "Mainnet" },
                { value: "testnet", label: "Testnet" },
              ]}
            />
            <SegmentedControl
              label="Language"
              value={locale}
              onValueChange={(value) => setLocale(value as SampleLocale)}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
              ]}
            />
          </div>
        </div>

        <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} className="flex flex-col gap-8">
          <Section title="Type">
            <div className="font-display text-[32px] font-semibold leading-10">Kawase 為替 · {t.listening}</div>
            <div className="font-display text-[26px] font-medium leading-8">{t.agentLine}</div>
            <p className="text-base">{t.agentReply}</p>
            <p className="text-muted-foreground text-sm">{t.heard}</p>
            <div className="font-mono text-2xl font-semibold tabular-nums">
              <bdi dir="ltr">1,240.50 USDC</bdi>
            </div>
            <div className="text-muted-foreground font-mono text-sm tabular-nums">
              <bdi dir="ltr">{SAMPLE_ADDRESS}</bdi>
            </div>
            <p className="text-base">हिन्दी · বাংলা · اردو · 中文 · Русский</p>
          </Section>

          <Section title="Network">
            <TestnetStrip label={t.testnetStrip} className="rounded-lg" />
            <div>
              <NetworkChip label={testnet ? t.arcTestnet : t.arc} />
            </div>
          </Section>

          <Section title="Buttons">
            <div className="flex flex-wrap gap-2">
              <Button>{t.send}</Button>
              <Button variant="secondary">{t.request}</Button>
              <Button variant="outline">{t.swap}</Button>
              <Button variant="ghost">{t.cancel}</Button>
              <Button variant="destructive">Delete</Button>
              <Button disabled>Disabled</Button>
            </div>
          </Section>

          <Section title="Inputs">
            <div>
              <SegmentedControl
                label={t.network}
                defaultValue="mainnet"
                options={[
                  { value: "mainnet", label: t.mainnet },
                  { value: "testnet", label: t.testnet },
                ]}
              />
            </div>
          </Section>

          <Section title="Orb and caption">
            <div className="flex flex-col items-center gap-4">
              <div className="size-56" role="img" aria-label={t.listening}>
                <VoicePoweredOrb colors={tokens.orb[network]} level={ORB_LEVELS[orb]} />
              </div>
              <StateLabel>{t.listening}</StateLabel>
              <SegmentedControl
                label="Voice level"
                value={orb}
                onValueChange={(value) => setOrb(value as keyof typeof ORB_LEVELS)}
                options={[
                  { value: "quiet", label: "Quiet" },
                  { value: "speaking", label: "Speaking" },
                ]}
              />
              <div className="font-display text-center text-[26px] font-medium leading-8 tracking-tight">
                <ResponseStream key={`${locale}-${orb}`} mode="fade" speed={80} textStream={t.agentLine} />
              </div>
            </div>
          </Section>

          <Section title="Confirm">
            <div className="border-border overflow-hidden rounded-xl border">
              <ConfirmSheet
                rows={[
                  { label: t.send, value: "25.00 USDC", emphasis: true },
                  { label: t.to, value: t.amina, detail: SAMPLE_ADDRESS },
                ]}
              >
                <Button
                  className="bg-network text-network-foreground hover:bg-network/90 h-14 gap-2 text-base font-semibold"
                  onClick={() => setLog("confirm pressed")}
                >
                  <ScanFace className="size-5" />
                  {t.confirm}
                </Button>
                <Button variant="ghost" className="text-muted-foreground h-11" onClick={() => setLog("cancel pressed")}>
                  {t.cancel}
                </Button>
              </ConfirmSheet>
            </div>
            <HoldToConfirm
              className="h-14 w-full text-base font-semibold"
              confirmLabel={t.held}
              onConfirm={() => setLog("hold completed")}
              onAbort={() => setLog("hold released early")}
            >
              {t.hold}
            </HoldToConfirm>
            <p className="text-muted-foreground text-xs">Last action: {log || "none"}</p>
          </Section>

          <Section title="Receipt">
            <ReceiptCard
              className="max-w-none"
              title={t.receiptTitle}
              badge={testnet ? t.arcTestnet : t.arc}
              details={[
                { label: t.to, value: `${t.amina} · ${SAMPLE_ADDRESS}` },
                { label: t.fee, value: "0.0021 USDC" },
                { label: t.total, value: "25.0021 USDC", isBold: true },
              ]}
              buttonText={t.viewReceipt}
              onAction={() => setLog("receipt opened")}
            />
          </Section>


          <Section title="Activity">
            <ActivityFeed
              events={t.events.map((event, index) => {
                const EventIcon = EVENT_ICONS[event.id];
                return { ...event, icon: <EventIcon />, tone: index === 1 ? "in" : "out" };
              })}
            />
          </Section>

          <Section title="Conversation">
            <Bubble align="end">
              <BubbleContent>{t.userMessage}</BubbleContent>
            </Bubble>
            <Bubble variant="muted">
              <BubbleContent>{t.agentReply}</BubbleContent>
            </Bubble>
            <AiSuggestedActions
              className="[&>button]:border-border [&>button]:bg-card flex flex-wrap font-sans [&>button]:rounded-full [&>button]:px-3 [&>button]:py-2"
              suggestions={t.suggestions.map((label) => ({ label, prompt: label }))}
              onSelect={(prompt) => setMessage(prompt)}
            />
            <Composer
              value={message}
              onValueChange={setMessage}
              onSubmit={() => {
                setLog(`sent: ${message}`);
                setMessage("");
              }}
              onAttach={() => setLog("attach pressed")}
              onTalk={() => setLog("talk pressed")}
              labels={t.composer}
            />
          </Section>

        </div>
      </div>
    </div>
  );
}
