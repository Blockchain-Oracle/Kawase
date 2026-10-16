// The card on a phone: the same 1080 × 1350 geometry as the web's canvas (layout.ts), drawn with the app's own pieces —
// Text for every word (the phone's fonts cover all ten languages), react-native-svg for the line, the default avatar,
// the real coin marks, the hanko, the receipt's dotted QR — and scaled to the screen. "Share image" captures it at
// 1080 px (react-native-view-shot, as the receipt does). Each text sits in its own box with one line, shrinking to fit
// (adjustsFontSizeToFit) and ending in "…" past that, so no label reaches another. The phone shows the last frame;
// the film is the web's.
import * as React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polygon, Rect, Stop } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { FONT, useTheme } from "@/components/kit/theme";
import type { Fx } from "@/portfolio/format";

import { fileStem, type CardHandle } from "./card-handle";
import { chartGeometry, FACT_W, FRAME, HERO_FIGURE_MAX_W, L, pillTop, STUB_LINE_MAX_W, TICK_W } from "./layout";
import type { MarkerKind, PeriodCardData } from "./model";
import { CARD_URL, toneOf, type CardWords } from "./words";

const ASCENT = 0.98;
const LINE = 1.24;
const MIN_SCALE = 0.6;

type Box = { left: number; base: number; size: number; width: number; align?: "left" | "right" | "center"; weight?: TextStyle["fontWeight"]; display?: boolean; color: string; track?: number; upper?: boolean };

/** One line of text in its own box, its baseline where the canvas puts it. */
function T({ children, box }: { children: string; box: Box }) {
  const left = box.align === "right" ? box.left - box.width : box.align === "center" ? box.left - box.width / 2 : box.left;
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={MIN_SCALE}
      allowFontScaling={false}
      style={{
        position: "absolute",
        left,
        top: box.base - box.size * ASCENT,
        width: box.width,
        fontSize: box.size,
        lineHeight: box.size * LINE,
        fontFamily: box.display ? FONT.display : FONT.sans,
        fontWeight: box.display ? "900" : (box.weight ?? "400"),
        color: box.color,
        textAlign: box.align ?? "left",
        letterSpacing: box.track ?? 0,
        textTransform: box.upper ? "uppercase" : "none",
        fontVariant: ["tabular-nums"],
      }}
    >
      {children}
    </Text>
  );
}

function glyphPath(kind: MarkerKind, s: number): string {
  const h = s * 0.32;
  const a = s * 0.18;
  switch (kind) {
    case "in":
      return `M0 ${-h} L0 ${h} M${-a} ${h - a} L0 ${h} L${a} ${h - a}`;
    case "out":
      return `M0 ${h} L0 ${-h} M${-a} ${-h + a} L0 ${-h} L${a} ${-h + a}`;
    case "bridge":
      return `M${-h} 0 L${h} 0 M${h - a} ${-a} L${h} 0 L${h - a} ${a}`;
    case "trade":
      return `M${-h} ${h} L${h} ${-h} M${h - a * 1.4} ${-h} L${h} ${-h} L${h} ${-h + a * 1.4}`;
    case "swap":
      return `M${-h} ${-h * 0.45} L${h} ${-h * 0.45} M${h - a} ${-h * 0.45 - a} L${h} ${-h * 0.45} L${h - a} ${-h * 0.45 + a} M${h} ${h * 0.45} L${-h} ${h * 0.45} M${-h + a} ${h * 0.45 - a} L${-h} ${h * 0.45} L${-h + a} ${h * 0.45 + a}`;
    default:
      return `M${-h} 0 L${h} 0 M0 ${-h} L0 ${h}`;
  }
}

export const ShareCardView = React.forwardRef<CardHandle, { card: PeriodCardData; words: CardWords; fx: Fx; seed: string; width: number }>(
  function ShareCardView({ card, words, seed, width }, ref) {
    const { color } = useTheme();
    const reduced = useReducedMotion();
    const shot = React.useRef<View>(null);
    const k = width / FRAME.w;
    const g = React.useMemo(() => chartGeometry(card.series, card.markers, card.from, card.to), [card]);
    const tone = toneOf(card.change);
    const line = tone === "up" ? color.up : tone === "down" ? color.down : color.ink;
    const onLine = tone === "up" ? color.upForeground : tone === "down" ? color.downForeground : color.card;
    const p = L.plot;
    const path = g.points.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
    const first = g.points[0]!;
    const last = g.points.at(-1)!;
    const area = `${path} L${last.x.toFixed(1)} ${p.y + p.h} L${first.x.toFixed(1)} ${p.y + p.h} Z`;
    const top = pillTop(last.y);
    const pillW = Math.min(L.pill.maxW, Math.max(120, words.pill.length * L.pill.size * 0.6 + L.pill.padX * 2));
    const headCovered = g.markers.some((m) => Math.hypot(m.x - last.x, m.y - last.y) < L.marker.r);
    const badge: Record<MarkerKind, [string, string]> = {
      in: [color.up, color.upForeground],
      out: [color.ink, color.card],
      swap: [color.accent, color.accentForeground],
      bridge: [color.ink, color.card],
      earn: [color.up, color.upForeground],
      trade: [color.accent, color.accentForeground],
    };
    const grid: React.ReactNode[] = [];
    for (let x = p.x; x <= p.x + p.w; x += L.grid.step)
      for (let y = p.y; y <= p.y + p.h; y += L.grid.step) grid.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={L.grid.dot} fill={color.ink} opacity={L.grid.alpha} />);
    const dots = (n: number) => Array.from({ length: n });
    const perfDashes = dots(Math.floor((L.paper.w - L.perf.notch * 2 - 24) / (L.perf.dash + L.perf.gap)));

    React.useImperativeHandle(
      ref,
      () => ({
        replay: () => undefined,
        image: async () => {
          const uri = await captureRef(shot, { format: "png", quality: 1, result: "tmpfile", width: FRAME.w, height: FRAME.h });
          return { kind: "uri", uri, name: `${fileStem(card.period)}.png` };
        },
      }),
      [card.period],
    );

    return (
      <Animated.View entering={reduced ? undefined : FadeIn.duration(320)} style={{ width, height: FRAME.h * k, direction: "ltr" }} accessible accessibilityRole="image" accessibilityLabel={words.alt}>
        <View ref={shot} collapsable={false} style={{ width, height: FRAME.h * k, overflow: "hidden", borderRadius: L.paper.r * k, backgroundColor: color.ground }}>
          <View style={[styles.frame, { transform: [{ scale: k }] }]}>
            <Svg width={FRAME.w} height={FRAME.h} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="share-card-fill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={line} stopOpacity={L.line.fillAlpha} />
                  <Stop offset="1" stopColor={line} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect x={L.paper.x} y={L.paper.y} width={L.paper.w} height={L.paper.h} rx={L.paper.r} fill={color.card} />
              {perfDashes.map((_, i) => {
                const x = L.paper.x + L.perf.notch + 12 + i * (L.perf.dash + L.perf.gap);
                return <Line key={i} x1={x} x2={x + L.perf.dash} y1={L.perf.y} y2={L.perf.y} stroke={color.hairline} strokeWidth={2} />;
              })}
              <Circle cx={L.paper.x} cy={L.perf.y} r={L.perf.notch} fill={color.ground} />
              <Circle cx={L.paper.x + L.paper.w} cy={L.perf.y} r={L.perf.notch} fill={color.ground} />
              {grid}
              <Line x1={p.x} x2={p.x + p.w} y1={g.levelY} y2={g.levelY} stroke={color.text2} strokeWidth={L.level.width} strokeDasharray={`${L.level.dash} ${L.level.dash}`} opacity={L.level.alpha} />
              <Path d={area} fill="url(#share-card-fill)" />
              <Path d={path} stroke={line} strokeWidth={L.line.width} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              <Line x1={last.x + L.head.r} x2={L.pill.right - pillW - 6} y1={last.y} y2={top + L.pill.h / 2} stroke={line} strokeWidth={L.level.width} strokeDasharray={`${L.level.dash / 2} ${L.level.dash / 2}`} opacity={0.55} />
              {headCovered ? null : (
                <>
                  <Circle cx={last.x} cy={last.y} r={L.head.halo} fill={line} opacity={L.head.haloAlpha} />
                  <Circle cx={last.x} cy={last.y} r={L.head.r} fill={line} />
                </>
              )}
              <Rect x={L.pill.right - pillW} y={top} width={pillW} height={L.pill.h} rx={L.pill.r} fill={line} />
              <Line x1={L.left} x2={L.right} y1={L.facts.rule} y2={L.facts.rule} stroke={color.hairline} strokeWidth={2} />
              {[1, 2].map((i) => (
                <Line key={i} x1={L.left + i * FACT_W} x2={L.left + i * FACT_W} y1={L.facts.top + 6} y2={L.facts.bottom - 6} stroke={color.hairline} strokeWidth={2} />
              ))}
              {words.pct && words.pctUp !== null ? (
                <Polygon
                  points={(() => {
                    const x = L.left + L.hero.pct.tri / 2;
                    const y = L.hero.pct.base - L.hero.pct.size * 0.34;
                    const h = L.hero.pct.tri / 2;
                    return words.pctUp ? `${x},${y - h} ${x + h},${y + h} ${x - h},${y + h}` : `${x},${y + h} ${x + h},${y - h} ${x - h},${y - h}`;
                  })()}
                  fill={words.pctUp ? color.up : color.down}
                />
              ) : null}
            </Svg>

            <View style={[styles.abs, { left: L.header.avatar.x, top: L.header.avatar.y }]}>
              <DefaultAvatar seed={seed} size={L.header.avatar.size} />
            </View>
            <View style={[styles.abs, styles.headerRow, { top: L.header.chip.top, left: L.header.textX, width: L.right - L.header.textX, gap: L.header.gap }]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={MIN_SCALE} allowFontScaling={false} style={[styles.grow, { fontFamily: FONT.sans, fontWeight: "600", fontSize: L.header.handle.size, color: color.ink }]}>
                {words.handle}
              </Text>
              <View style={{ height: L.header.chip.h, borderRadius: L.header.chip.h / 2, paddingHorizontal: L.header.chip.padX, justifyContent: "center", backgroundColor: color.selectedRow, maxWidth: L.header.rightMax }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={MIN_SCALE} allowFontScaling={false} style={{ fontFamily: FONT.sans, fontWeight: "600", fontSize: L.header.chip.size, letterSpacing: L.header.chip.track, textTransform: "uppercase", color: color.link }}>
                  {words.chip}
                </Text>
              </View>
            </View>
            <View style={[styles.abs, styles.headerRow, { top: L.header.date.base - L.header.date.size * ASCENT, left: L.header.textX, width: L.right - L.header.textX, gap: L.header.gap }]}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={MIN_SCALE} allowFontScaling={false} style={[styles.grow, { fontFamily: FONT.sans, fontSize: L.header.date.size, color: color.text2 }]}>
                {words.dates}
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={MIN_SCALE} allowFontScaling={false} style={{ maxWidth: L.header.rightMax, fontFamily: FONT.sans, fontSize: L.header.network.size, color: color.text2, textAlign: "right" }}>
                {words.network}
              </Text>
            </View>

            {g.markers.map((m) => (
              <View key={`${m.t}-${m.kind}`} style={[styles.abs, { left: m.x - L.marker.r - L.marker.ring, top: m.y - L.marker.r - L.marker.ring }]}>
                <View style={{ padding: L.marker.ring, borderRadius: L.marker.r + L.marker.ring, backgroundColor: color.card }}>
                  {m.token ? (
                    <TokenMark token={m.token} size={L.marker.r * 2} />
                  ) : (
                    <View style={{ width: L.marker.r * 2, height: L.marker.r * 2, borderRadius: L.marker.r, backgroundColor: color.raised2 }} />
                  )}
                </View>
                <View style={[styles.abs, { left: L.marker.ring + L.marker.r * 1.72 - L.marker.badge - 3, top: L.marker.ring + L.marker.r * 1.72 - L.marker.badge - 3, width: (L.marker.badge + 3) * 2, height: (L.marker.badge + 3) * 2, borderRadius: L.marker.badge + 3, backgroundColor: color.card, alignItems: "center", justifyContent: "center" }]}>
                  <Svg width={L.marker.badge * 2} height={L.marker.badge * 2} viewBox={`${-L.marker.badge} ${-L.marker.badge} ${L.marker.badge * 2} ${L.marker.badge * 2}`}>
                    <Circle cx={0} cy={0} r={L.marker.badge} fill={badge[m.kind][0]} />
                    <Path d={glyphPath(m.kind, L.marker.badge * 1.25)} stroke={badge[m.kind][1]} strokeWidth={L.marker.badge * 0.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                </View>
                {m.count > 1 ? (
                  <View style={[styles.abs, { left: L.marker.ring + L.marker.r * 1.5, top: -L.marker.count.h * 0.4, height: L.marker.count.h + 4, paddingHorizontal: L.marker.count.padX, borderRadius: L.marker.count.h, borderWidth: 2, borderColor: color.card, backgroundColor: color.ink, justifyContent: "center" }]}>
                    <Text allowFontScaling={false} style={{ fontFamily: FONT.sans, fontWeight: "700", fontSize: L.marker.count.size, color: color.card }}>{`+${m.count - 1}`}</Text>
                  </View>
                ) : null}
              </View>
            ))}

            <T box={{ left: L.pill.right - pillW / 2, base: top + L.pill.h / 2 + L.pill.size * 0.36, size: L.pill.size, width: pillW - L.pill.padX * 2, align: "center", weight: "700", color: onLine }}>{words.pill}</T>
            <T box={{ left: p.x, base: L.ticks.base, size: L.ticks.size, width: TICK_W, color: color.text2 }}>{words.ticks[0]}</T>
            <T box={{ left: p.x + p.w / 2, base: L.ticks.base, size: L.ticks.size, width: TICK_W, align: "center", color: color.text2 }}>{words.ticks[1]}</T>
            <T box={{ left: p.x + p.w, base: L.ticks.base, size: L.ticks.size, width: TICK_W, align: "right", color: color.text2 }}>{words.ticks[2]}</T>

            <T box={{ left: L.left, base: L.hero.label.base, size: L.hero.label.size, width: HERO_FIGURE_MAX_W, weight: "600", color: color.text2, track: L.hero.label.track, upper: true }}>{words.label}</T>
            <T box={{ left: L.left, base: L.hero.figure.base, size: L.hero.figure.size, width: HERO_FIGURE_MAX_W, display: true, color: line }}>{words.figure}</T>
            <View style={[styles.abs, styles.headerRow, { left: L.left + (words.pct ? L.hero.pct.tri + L.hero.pct.gap : 0), top: L.hero.pct.base - L.hero.pct.size * ASCENT, width: HERO_FIGURE_MAX_W - (words.pct ? L.hero.pct.tri + L.hero.pct.gap : 0), gap: L.hero.pct.gap * 2 }]}>
              {words.pct ? (
                <Text numberOfLines={1} allowFontScaling={false} style={{ fontFamily: FONT.sans, fontWeight: "600", fontSize: L.hero.pct.size, color: words.pctUp ? color.up : color.down }}>
                  {words.pct}
                </Text>
              ) : null}
              {words.fromStart ? (
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={MIN_SCALE} allowFontScaling={false} style={[styles.shrink, { fontFamily: FONT.sans, fontSize: L.hero.pct.size - 4, color: color.text2 }]}>
                  {words.fromStart}
                </Text>
              ) : null}
            </View>
            <View style={[styles.abs, { left: L.hanko.x, top: L.hanko.y, transform: [{ rotate: `${L.hanko.tilt}deg` }] }]}>
              <Hanko size={L.hanko.size} id={`share-card-hanko-${card.period}`} />
            </View>

            {words.facts.map((fact, i) => {
              const x0 = L.left + i * FACT_W + (i > 0 ? L.facts.padX : 0);
              const w = FACT_W - L.facts.padX * (i > 0 ? 2 : 1);
              return (
                <React.Fragment key={i}>
                  <T box={{ left: x0, base: L.facts.label.base, size: L.facts.label.size, width: w, color: color.text2 }}>{fact.label}</T>
                  <T box={{ left: x0, base: L.facts.value.base, size: L.facts.value.size, width: w, weight: "600", color: color.ink }}>{fact.value}</T>
                </React.Fragment>
              );
            })}

            <View style={[styles.abs, { left: L.stub.mark.x, top: L.stub.mark.y }]}>
              <KawaseMark size={L.stub.mark.size} />
            </View>
            <T box={{ left: L.stub.word.x, base: L.stub.word.base, size: L.stub.word.size, width: STUB_LINE_MAX_W, display: true, color: color.ink }}>{words.word}</T>
            <T box={{ left: L.stub.line.x, base: L.stub.line.base, size: L.stub.line.size, width: STUB_LINE_MAX_W, color: color.text2 }}>{words.stubLine}</T>
            <View style={[styles.abs, { left: L.stub.qr.x, top: L.stub.qr.y, width: L.stub.qr.size, height: L.stub.qr.size, borderRadius: L.stub.qr.r, backgroundColor: color.paper, alignItems: "center", justifyContent: "center" }]}>
              <DottedQr value={CARD_URL} size={L.stub.qr.size - L.stub.qr.pad * 2} dotColor={color.paperInk} background={color.paper} center={<KawaseMark size={(L.stub.qr.size - L.stub.qr.pad * 2) * 0.2} />} />
            </View>
          </View>
        </View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  frame: { position: "absolute", left: 0, top: 0, width: FRAME.w, height: FRAME.h, transformOrigin: "top left" },
  abs: { position: "absolute" },
  headerRow: { flexDirection: "row", alignItems: "center" },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
});
