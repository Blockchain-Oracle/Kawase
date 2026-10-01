// The authored default avatar (revamp add-on 2): a koban on one of the five onboarding colour fields, chosen from
// the account id so a person keeps the same one everywhere — lists never fall back to initials in a grey circle.
import { Koban } from "@kawase/ui-native/components/art/koban";
import { tokens } from "@kawase/ui-tokens";
import { View } from "react-native";

const TINTS = Object.values(tokens.story.fields);
const KOBAN_RATIO = 0.72;
const HASH_SEED = 7;
const HASH_MULTIPLIER = 31;
/** Enough of the seed to keep SVG ids unique per avatar. */
const ID_CHARS = 8;

/** A small stable hash of the id (not for security), to pick the tint. */
const pick = (seed: string) => [...seed].reduce((hash, char) => (hash * HASH_MULTIPLIER + char.charCodeAt(0)) >>> 0, HASH_SEED) % TINTS.length;

type DefaultAvatarProps = {
  /** The account id (or any stable seed). */
  seed: string;
  size: number;
  /** What a screen reader calls it ("Your avatar"). */
  label?: string;
};

function DefaultAvatar({ seed, size, label }: DefaultAvatarProps) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      className="items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: TINTS[pick(seed)] }}
    >
      <Koban width={size * KOBAN_RATIO} id={`avatar-${seed.slice(0, ID_CHARS)}`} rotate={-12} />
    </View>
  );
}

export { DefaultAvatar };
