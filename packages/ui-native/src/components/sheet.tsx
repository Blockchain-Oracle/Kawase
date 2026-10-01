// The sheet (P21 / F08 / F20, M02 grammar): a grab handle, a title, an optional subtitle, a dim scrim (not a blur),
// content-sized, dismissed by a pull, a scrim tap or the parent setting `open` to false. A nested step shows a back
// chevron in the header (F21 / M16: the parent comes back with its values); the header's end holds an optional
// control (the language pill on the sign-in sheet). Text fields inside use `SheetInput`, so the sheet rides the
// keyboard instead of being covered by it. Kawase chrome over
// @gorhom/bottom-sheet's modal, which needs `BottomSheetModalProvider` above it (mounted inside LocaleProvider so
// the reading direction applies). Gorhom's own views take hex colours, not class names, so the theme is passed in.
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, INPUT_TEXT_START, TEXT_START } from "@kawase/ui-native/lib/utils";
import { ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { withUniwind } from "uniwind";

type SheetColors = {
  /** The `card` token: the sheet's surface. */
  background: string;
  /** The `muted` token: the grab handle. */
  handle: string;
  /** The `scrim` token: painted over the page behind. */
  scrim: string;
};

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  colors: SheetColors;
  /** What a screen reader calls the scrim ("Close"), in the user's language. */
  closeLabel: string;
  /** The home indicator height, added under the content. */
  bottomInset?: number;
  /** A nested step: shows a back chevron before the title that calls this. */
  onBack?: () => void;
  /** "Back", for the chevron's spoken label. */
  backLabel?: string;
  /** A control at the header's end (the language pill). */
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

const RADIUS = 28;
const HANDLE_WIDTH = 40;
const HANDLE_HEIGHT = 4;
const CONTENT_BOTTOM = 16;
/** The scrim token is already translucent; the backdrop applies it at full strength. */
const SCRIM_OPACITY = 1;
const BACK_SIZE = 40;
const BACK_HIT_SLOP = 8;
/** A sheet never grows past this share of the window; longer content scrolls inside it (review R13). */
const MAX_HEIGHT_SHARE = 0.9;

function Sheet({ open, onClose, title, subtitle, colors, closeLabel, bottomInset = 0, onBack, backLabel, headerEnd, children, className }: SheetProps) {
  const ref = React.useRef<BottomSheetModal>(null);
  const { height: windowHeight } = useWindowDimensions();

  // Dismissing a modal that was never presented leaves gorhom in its "dismissing" state for good, and the next
  // `present()` is then ignored — so only a sheet that is actually up gets dismissed.
  const presented = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      presented.current = true;
      ref.current?.present();
    } else if (presented.current) {
      presented.current = false;
      ref.current?.dismiss();
    }
  }, [open]);

  const handleDismiss = React.useCallback(() => {
    presented.current = false;
    onClose();
  }, [onClose]);

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={SCRIM_OPACITY}
        pressBehavior="close"
        accessibilityLabel={closeLabel}
        style={[props.style, { backgroundColor: colors.scrim }]}
      />
    ),
    [colors.scrim, closeLabel],
  );

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={handleDismiss}
      enableDynamicSizing
      maxDynamicContentSize={Math.round(windowHeight * MAX_HEIGHT_SHARE)}
      // Gorhom makes the whole sheet one "adjustable" element by default, which hides its rows from a screen reader.
      accessible={false}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.background, borderRadius: RADIUS }}
      handleIndicatorStyle={{ backgroundColor: colors.handle, width: HANDLE_WIDTH, height: HANDLE_HEIGHT }}
    >
      <BottomSheetScrollView contentContainerStyle={{ paddingBottom: bottomInset + CONTENT_BOTTOM }} keyboardShouldPersistTaps="handled">
        {title || onBack || headerEnd ? (
          <View className="gap-1 px-5 pb-4 pt-1">
            {onBack || headerEnd ? (
              <View className="min-h-10 flex-row items-center justify-between pb-2">
                {onBack ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={backLabel}
                    hitSlop={BACK_HIT_SLOP}
                    onPress={onBack}
                    className="bg-muted active:bg-secondary items-center justify-center rounded-full"
                    style={{ width: BACK_SIZE, height: BACK_SIZE }}
                  >
                    <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
                  </Pressable>
                ) : (
                  <View />
                )}
                {headerEnd}
              </View>
            ) : null}
            {title ? <Text className={cn("font-display text-foreground text-2xl font-bold", TEXT_START)}>{title}</Text> : null}
            {subtitle ? <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{subtitle}</Text> : null}
          </View>
        ) : null}
        <View className={cn("px-5", className)}>{children}</View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// On the web there is no on-screen keyboard to ride, and gorhom's input calls a React Native API that
// react-native-web lacks (`TextInput.State.currentlyFocusedInput`), so a plain field is used there.
const StyledSheetTextInput = withUniwind(Platform.OS === "web" ? (TextInput as unknown as typeof BottomSheetTextInput) : BottomSheetTextInput);

type SheetInputProps = React.ComponentProps<typeof BottomSheetTextInput> & { className?: string };

/** A text field inside a sheet: the filled field of `Input`, wired to the sheet's keyboard handling. */
function SheetInput({ className, ...props }: SheetInputProps) {
  return (
    <StyledSheetTextInput
      className={cn("bg-muted text-foreground h-14 w-full rounded-2xl px-4 font-sans text-base", INPUT_TEXT_START, className)}
      {...props}
    />
  );
}

export { Sheet, SheetInput };
export type { SheetColors, SheetInputProps, SheetProps };
