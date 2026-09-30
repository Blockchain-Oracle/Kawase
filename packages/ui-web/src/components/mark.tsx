// Kawase glue (no 21st equivalent): the web twin of ui-native's Mark. A real entity mark from @kawase/identity with
// the kit's colours, a mono variant for dense lists, a labelled neutral disc when the artwork has not arrived, and
// an optional chain badge. Never a stand-in logo.
import { fallbackFontSize, fallbackLabel, getEntity, markFile, type Entity, type MarkVariant } from "@kawase/identity";
import { MARKS, type MarkStem } from "@kawase/identity/web";

import { cn } from "@kawase/ui-web/lib/utils";

const DEFAULT_SIZE = 44;
const GLYPH_RATIO = 0.6;
const BADGE_RATIO = 0.42;

export type MarkProps = {
  entity: Entity | string;
  size?: number;
  variant?: MarkVariant;
  /** Colour for the mono variant (a CSS colour; defaults to currentColor). */
  tint?: string;
  disc?: boolean;
  chainBadge?: Entity | string;
  className?: string;
};

const resolve = (entity: Entity | string): Entity | undefined => (typeof entity === "string" ? getEntity(entity) : entity);

export function Mark({ entity, size = DEFAULT_SIZE, variant = "color", tint, disc, chainBadge, className }: MarkProps) {
  const resolved = resolve(entity);
  const stem = resolved ? markFile(resolved, variant) : undefined;
  const Component = stem && stem in MARKS ? MARKS[stem as MarkStem] : undefined;
  const name = resolved?.name ?? (typeof entity === "string" ? entity : "");
  const mono = variant === "mono";
  const onDisc = disc ?? (resolved?.shape === "uncontained" && !mono);
  const badge = chainBadge ? resolve(chainBadge) : undefined;
  const box = { width: size, height: size };
  const label = resolved ? fallbackLabel(resolved) : "?";

  let body: React.ReactNode;
  if (!resolved || !Component) {
    body = (
      <span
        className="flex items-center justify-center rounded-full border border-border bg-muted font-semibold text-muted-foreground"
        style={{ ...box, fontSize: fallbackFontSize(label, size) }}
      >
        {label}
      </span>
    );
  } else if (onDisc) {
    const glyph = Math.round(size * GLYPH_RATIO);
    body = (
      <span className="flex items-center justify-center overflow-hidden rounded-full border border-border bg-card" style={box}>
        <Component width={glyph} height={glyph} aria-hidden />
      </span>
    );
  } else {
    body = (
      <span className={cn("block", resolved.shape === "disc" && "overflow-hidden rounded-full")} style={box}>
        <Component
          width={size}
          height={size}
          aria-hidden
          {...(mono ? { fill: tint ?? "currentColor", style: { color: tint ?? "currentColor" } } : {})}
        />
      </span>
    );
  }

  return (
    <span role="img" aria-label={name} className={cn("relative inline-block shrink-0", className)} style={box}>
      {body}
      {badge ? (
        <span className="absolute -bottom-0.5 -end-0.5 rounded-full bg-background p-px">
          <Mark entity={badge} size={Math.round(size * BADGE_RATIO)} variant="color" />
        </span>
      ) : null}
    </span>
  );
}
