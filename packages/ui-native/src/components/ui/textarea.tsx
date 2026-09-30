import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";
import { Platform, TextInput } from "react-native";

function Textarea({
  className,
  multiline = true,
  numberOfLines = Platform.select({ web: 2, native: 8 }), // On web, numberOfLines also determines initial height. On native, it determines the maximum height.
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        "text-foreground border-input flex min-h-16 w-full flex-row rounded-2xl border border-transparent bg-muted px-4 py-3 font-sans text-base md:text-sm",
        Platform.select({
          web: "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive field-sizing-content resize-y outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed",
        }),
        props.editable === false && "opacity-50",
        INPUT_TEXT_START,
        className,
      )}
      // Uniwind styles the placeholder through a colour prop, not a `placeholder:` class.
      placeholderTextColorClassName="accent-muted-foreground"
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical="top"
      {...props}
    />
  );
}

export { Textarea };
