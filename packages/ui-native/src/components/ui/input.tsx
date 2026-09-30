import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";
import { Platform, TextInput } from "react-native";

function Input({ className, ...props }: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        // A filled field (the references' inputs sit on a raised fill, not a hairline); the ring appears on focus.
        "border-input bg-muted text-foreground flex h-14 w-full min-w-0 flex-row items-center rounded-2xl border border-transparent px-4 py-1 font-sans text-base leading-5",
        props.editable === false && cn("opacity-50", Platform.select({ web: "disabled:cursor-not-allowed" })),
        Platform.select({
          web: cn(
            "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground transition-[color,box-shadow] md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
          ),
        }),
        INPUT_TEXT_START,
        className,
      )}
      // Uniwind styles the placeholder through a colour prop, not a `placeholder:` class.
      placeholderTextColorClassName="accent-muted-foreground"
      {...props}
    />
  );
}

export { Input };
