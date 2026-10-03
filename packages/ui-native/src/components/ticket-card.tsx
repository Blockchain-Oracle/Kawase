// A ticket-style receipt (21st.dev 6492 · ravikatiyar162 "Ticket Confirmation Card", as a native twin on Lime on Ink):
// the success mark in a soft lime disc, a title and a muted line, a dashed tear line with the side cut-outs, the facts
// in a two-column grid (label over value, the amount right-aligned and large), a tinted strip for the payer or
// method, another tear line, and a barcode drawn from the reference (deterministic bars, the reference spelled under
// it). No confetti: Kawase's success is calm (the hanko stamp lives elsewhere). Used for payout and refund receipts.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { CircleCheck, CircleMinus } from "lucide-react-native";
import type * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";

import { Icon } from "@kawase/ui-native/components/ui/icon";

type TicketFact = { label: string; value: string; emphasis?: boolean };

type TicketCardProps = {
  title: string;
  subtitle?: string | undefined;
  facts: TicketFact[];
  /** A tinted strip under the facts: who paid or how (a mark and two lines). */
  strip?: { media?: React.ReactNode; title: string; detail?: string | undefined } | undefined;
  /** The reference the barcode is drawn from (a transaction hash). */
  code?: string | undefined;
  /** What is shown under the barcode (a short form of the code). */
  codeLabel?: string | undefined;
  tone?: "success" | "neutral";
  footer?: React.ReactNode;
  className?: string;
};

const APPEAR_MS = 400;
const MARK_DELAY_MS = 150;
const CUTOUT = 24;
const CUTOUT_INSET = 12;
/** Facts sit in two columns: label over value, the second column right-aligned. */
const COLUMNS = 2;
const BARS = 56;
const BAR_THIN = 1.5;
const BAR_WIDE = 2.5;
const BAR_GAP = 1.5;
const BARCODE_HEIGHT = 52;
const BAR_HEIGHT = 44;
const WIDE_SHARE = 0.7;
const HASH_SHIFT = 5;
const SEED_SCALE = 10_000;

/** The same bars for the same reference: a string hash seeds a sine-based sequence (as in the source). */
function bars(value: string) {
  const seed = value.split("").reduce((hash, char) => (Math.imul(hash, 1 << HASH_SHIFT) - hash + char.charCodeAt(0)) | 0, 0);
  const random = (step: number) => {
    const x = Math.sin(seed + step) * SEED_SCALE;
    return x - Math.floor(x);
  };
  return Array.from({ length: BARS }, (_, index) => (random(index) > WIDE_SHARE ? BAR_WIDE : BAR_THIN));
}

function Barcode({ value, label }: { value: string; label?: string | undefined }) {
  // Bars are plain views in the theme's foreground, so the code reads in both themes without a colour prop.
  return (
    <View className="items-center gap-2" accessibilityLabel={label ?? value}>
      <View className="flex-row items-center" style={{ height: BARCODE_HEIGHT, gap: BAR_GAP, direction: "ltr" }}>
        {bars(value).map((width, index) => (
          <View key={index} className="bg-foreground" style={{ width, height: BAR_HEIGHT }} />
        ))}
      </View>
      <Text selectable className="text-muted-foreground font-mono text-xs tracking-widest">
        {label ?? value}
      </Text>
    </View>
  );
}

function TearLine() {
  return (
    <View className="relative justify-center" style={{ height: CUTOUT }}>
      <View className="bg-background absolute rounded-full" style={{ width: CUTOUT, height: CUTOUT, start: -CUTOUT_INSET }} />
      <View className="border-border mx-4 border-t-2 border-dashed" />
      <View className="bg-background absolute rounded-full" style={{ width: CUTOUT, height: CUTOUT, end: -CUTOUT_INSET }} />
    </View>
  );
}

function TicketCard({ title, subtitle, facts, strip, code, codeLabel, tone = "success", footer, className }: TicketCardProps) {
  return (
    <Animated.View entering={FadeIn.duration(APPEAR_MS)} className="w-full">
      <View accessibilityLiveRegion="polite" className={cn("bg-card border-border overflow-hidden rounded-3xl border", className)}>
        <View className="items-center gap-1 px-5 pb-3 pt-5">
          <Animated.View entering={ZoomIn.delay(MARK_DELAY_MS).duration(APPEAR_MS)} className={cn("rounded-full p-3", tone === "success" ? "bg-primary/15" : "bg-muted")}>
            <Icon as={tone === "success" ? CircleCheck : CircleMinus} className={cn("size-8", tone === "success" ? "text-primary" : "text-muted-foreground")} />
          </Animated.View>
          <Text accessibilityRole="header" className="text-foreground mt-2 text-center text-xl font-semibold">
            {title}
          </Text>
          {subtitle ? <Text className="text-muted-foreground text-center text-sm">{subtitle}</Text> : null}
        </View>
        <TearLine />
        <View className="flex-row flex-wrap gap-y-3 px-5 py-3">
          {facts.map((fact, index) => (
            <View key={`${fact.label}-${index}`} className={cn("w-1/2 gap-0.5", index % COLUMNS === 1 && "items-end")}>
              <Text className="text-muted-foreground text-xs uppercase">{fact.label}</Text>
              <Text className={cn("text-foreground", fact.emphasis ? "text-lg font-semibold" : "text-sm font-medium", index % COLUMNS === 0 && TEXT_START)} style={{ fontVariant: ["tabular-nums"] }}>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
        {strip ? (
          <View className="bg-muted/50 mx-5 mb-3 flex-row items-center gap-3 rounded-2xl p-3">
            {strip.media}
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className={cn("text-foreground text-sm font-semibold", TEXT_START)}>
                {strip.title}
              </Text>
              {strip.detail ? (
                <Text numberOfLines={2} className={cn("text-muted-foreground text-xs", TEXT_START)}>
                  {strip.detail}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {code ? (
          <>
            <TearLine />
            <View className="px-5 pb-4 pt-2">
              <Barcode value={code} label={codeLabel} />
            </View>
          </>
        ) : null}
        {footer ? <View className="px-5 pb-4">{footer}</View> : null}
      </View>
    </Animated.View>
  );
}

export { TicketCard };
export type { TicketCardProps, TicketFact };
