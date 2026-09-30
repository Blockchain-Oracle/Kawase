// The Koe home screen composed from the web components, with sample content (internal; not the live screen).
import { tokens } from "@kawase/ui-tokens";
import { ConfirmSheet } from "@kawase/ui-web/components/confirm-sheet";
import { NetworkChip, TestnetStrip } from "@kawase/ui-web/components/network-chip";
import { StateLabel } from "@kawase/ui-web/components/state-label";
import { Button } from "@kawase/ui-web/components/ui/button";
import { ResponseStream } from "@kawase/ui-web/components/ui/response-stream";
import { VoicePoweredOrb } from "@kawase/ui-web/components/ui/voice-powered-orb";
import { Keyboard, ScanFace } from "lucide-react";

import { SAMPLE, SAMPLE_ADDRESS, type SampleLocale } from "@/gallery/sample";
import type { Network } from "@/theme/theme-provider";

type HomeSampleProps = {
  network: Network;
  locale: SampleLocale;
  /** Voice level for the orb, 0 to 1. */
  level?: number;
  /** False when embedded in the gallery. */
  fullScreen?: boolean;
};

export function HomeSample({ network, locale, level = 0.35, fullScreen = true }: HomeSampleProps) {
  const t = SAMPLE[locale];
  const testnet = network === "testnet";

  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
      className={`bg-background text-foreground mx-auto flex w-full max-w-[430px] flex-col font-sans ${fullScreen ? "min-h-dvh" : "h-[780px]"}`}
    >
      {testnet ? <TestnetStrip label={t.testnetStrip} /> : null}
      <header className="flex items-center justify-between px-5 pt-3">
        <NetworkChip label={testnet ? t.arcTestnet : t.arc} />
        <div className="flex items-center gap-3">
          <span dir="ltr" className="text-muted-foreground font-mono text-sm tabular-nums">
            {t.balance}
          </span>
          <Button variant="secondary" size="icon" className="size-11" aria-label={t.typeInstead}>
            <Keyboard className="size-5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="size-56" role="img" aria-label={t.listening}>
          <VoicePoweredOrb colors={tokens.orb[network]} level={level} />
        </div>
        <StateLabel>{t.listening}</StateLabel>
        <p className="text-muted-foreground text-center text-sm">{t.heard}</p>
        <div className="font-display text-center text-[26px] font-medium leading-8 tracking-tight">
          <ResponseStream key={t.agentLine} mode="fade" speed={80} textStream={t.agentLine} />
        </div>
      </div>

      <ConfirmSheet
        rows={[
          { label: t.send, value: "25.00 USDC", emphasis: true },
          { label: t.to, value: t.amina, detail: SAMPLE_ADDRESS },
        ]}
      >
        <Button className="bg-network text-network-foreground hover:bg-network/90 h-14 gap-2 text-base font-semibold">
          <ScanFace className="size-5" />
          {t.confirm}
        </Button>
        <Button variant="ghost" className="text-muted-foreground h-11">
          {t.cancel}
        </Button>
      </ConfirmSheet>
    </div>
  );
}
