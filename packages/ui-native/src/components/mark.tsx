// A real entity mark (token, chain, provider) from @kawase/identity, at any size, with the states the identity
// contract asks for: the kit's own colours by default, a single-colour variant for dense lists, a labelled neutral
// disc when the artwork has not been delivered, and an optional chain badge. Never a stand-in logo.
import { fallbackFontSize, fallbackLabel, getEntity, markFile, type Entity, type MarkVariant } from "@kawase/identity";
import { MARKS, type MarkStem } from "@kawase/identity/native";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { View } from "react-native";

const DEFAULT_SIZE = 44;
/** How much of the disc an uncontained glyph occupies. */
const GLYPH_RATIO = 0.6;
const BADGE_RATIO = 0.42;

type MarkProps = {
  /** The entity, or its canonical id ("token:eip155:5042:0x3600…", "chain:eip155:1", "provider:apple"). */
  entity: Entity | string;
  size?: number;
  /** "color" keeps the kit's colours; "mono" tints the mark with `tint` (default: the foreground). */
  variant?: MarkVariant;
  /** Colour for the mono variant, as a CSS colour string from the tokens. */
  tint?: string;
  /** Show the glyph on a disc even for the mono variant (lists) or never (chips). */
  disc?: boolean;
  /** A second, smaller entity in the trailing-bottom corner (the chain a token lives on). */
  chainBadge?: Entity | string;
  className?: string;
};

const resolve = (entity: Entity | string): Entity | undefined => (typeof entity === "string" ? getEntity(entity) : entity);

function Mark({ entity, size = DEFAULT_SIZE, variant = "color", tint, disc, chainBadge, className }: MarkProps) {
  const resolved = resolve(entity);
  const stem = resolved ? markFile(resolved, variant) : undefined;
  const Component = stem && stem in MARKS ? MARKS[stem as MarkStem] : undefined;
  const name = resolved?.name ?? (typeof entity === "string" ? entity : "");
  const mono = variant === "mono";
  const onDisc = disc ?? (resolved?.shape === "uncontained" && !mono);
  const badge = chainBadge ? resolve(chainBadge) : undefined;
  const badgeSize = Math.round(size * BADGE_RATIO);
  const label = resolved ? fallbackLabel(resolved) : "?";

  let body: React.ReactNode;
  if (!resolved || !Component) {
    // Not delivered yet: a neutral disc with the symbol or initials, never a fake logo.
    body = (
      <View
        className="bg-muted border-border items-center justify-center rounded-full border"
        style={{ width: size, height: size }}
      >
        <Text className="text-muted-foreground font-semibold" style={{ fontSize: fallbackFontSize(label, size) }}>
          {label}
        </Text>
      </View>
    );
  } else if (onDisc) {
    const glyph = Math.round(size * GLYPH_RATIO);
    // Brand marks are drawn for a light ground (Apple Pay's black apple vanished on the dark theme's card colour):
    // the disc is white in both themes, the way wallets show logo coins.
    body = (
      <View
        className="border-border items-center justify-center overflow-hidden rounded-full border bg-white"
        style={{ width: size, height: size }}
      >
        <View style={{ width: glyph, height: glyph }}>
          <Component width={glyph} height={glyph} />
        </View>
      </View>
    );
  } else {
    body = (
      <View className={cn(resolved.shape === "disc" && "overflow-hidden rounded-full")} style={{ width: size, height: size }}>
        <Component width={size} height={size} {...(mono ? { color: tint, fill: tint } : {})} />
      </View>
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name}
      className={cn("relative", className)}
      style={{ width: size, height: size }}
    >
      {body}
      {badge ? (
        <View className="absolute -bottom-0.5 -end-0.5 rounded-full bg-background p-px">
          <Mark entity={badge} size={badgeSize} variant="color" />
        </View>
      ) : null}
    </View>
  );
}

export { Mark };
export type { MarkProps };
