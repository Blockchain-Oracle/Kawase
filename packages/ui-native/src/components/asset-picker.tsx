// The universal asset picker (R1, surfaces.md "Pickers"): one family for Send, Swap, Request, Earn, Withdraw, the
// margin field and chat. A search field (name, symbol or address), the person's holdings across chains sorted by
// value, then whatever the search found, a "Hidden (N)" toggle for spam and lookalikes, and a "buy more" row.
// Presentational: the caller supplies the rows (already formatted), so the same picker serves every flow and every
// availability rule (an unavailable row says why, R2). It lives inside a `Sheet`.
import { AssetRow, type AssetRowProps } from "@kawase/ui-native/components/asset-row";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { SheetInput } from "@kawase/ui-native/components/sheet";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";
import { ChevronDown, Plus, Search } from "lucide-react-native";
import { View } from "react-native";

type PickerItem = AssetRowProps & { key: string };
type PickerSection = { key: string; label: string; items: readonly PickerItem[] };

type AssetPickerProps = {
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  sections: readonly PickerSection[];
  hidden?: { label: string; open: boolean; onToggle: () => void; items: readonly PickerItem[] };
  /** "Buy more with Apple Pay", "Add money"… */
  footer?: { label: string; onPress: () => void };
  loading?: boolean;
  /** Shown when nothing matches. */
  emptyLabel: string;
  className?: string;
};

const SKELETON_ROWS = 3;
const SKELETON_ROW_HEIGHT = 64;

function AssetPicker({ query, onQueryChange, searchPlaceholder, sections, hidden, footer, loading, emptyLabel, className }: AssetPickerProps) {
  const visible = sections.filter((section) => section.items.length > 0);
  return (
    <View className={cn("gap-4", className)}>
      <View className="bg-muted flex-row items-center gap-2 rounded-2xl px-4">
        <Icon as={Search} className="text-muted-foreground size-5" />
        <SheetInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={searchPlaceholder}
          accessibilityLabel={searchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          className={cn("text-foreground h-12 flex-1 text-base", INPUT_TEXT_START)}
        />
      </View>

      {loading && visible.length === 0 ? (
        <View className="bg-card border-border gap-px overflow-hidden rounded-2xl border">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="rounded-none" style={{ height: SKELETON_ROW_HEIGHT }} />
          ))}
        </View>
      ) : null}

      {visible.map((section) => (
        <ListGroup key={section.key} label={section.label}>
          {section.items.map(({ key, ...row }) => (
            <AssetRow key={key} {...row} />
          ))}
        </ListGroup>
      ))}

      {!loading && visible.length === 0 ? <Text className="text-muted-foreground px-1 py-6 text-center text-base">{emptyLabel}</Text> : null}

      {hidden && hidden.items.length > 0 ? (
        <View className="gap-2">
          <ListRow
            standalone
            title={hidden.label}
            onPress={hidden.onToggle}
            accessibilityLabel={hidden.label}
            trailing={<Icon as={ChevronDown} className={cn("text-muted-foreground size-5", hidden.open && "rotate-180")} />}
          />
          {hidden.open ? (
            <ListGroup>
              {hidden.items.map(({ key, ...row }) => (
                <AssetRow key={key} {...row} />
              ))}
            </ListGroup>
          ) : null}
        </View>
      ) : null}

      {footer ? <ListRow standalone title={footer.label} onPress={footer.onPress} leading={<Icon as={Plus} className="text-foreground size-5" />} chevron /> : null}
    </View>
  );
}

export { AssetPicker };
export type { AssetPickerProps, PickerItem, PickerSection };
