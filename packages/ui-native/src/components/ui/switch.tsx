// Reskinned for Kawase (Koe): colours from tokens in every theme, a larger touch area, and right-to-left travel.
import { cn } from "@kawase/ui-native/lib/utils";
import * as SwitchPrimitives from "@rn-primitives/switch";
import { Platform } from "react-native";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "flex h-[1.15rem] w-8 shrink-0 flex-row items-center rounded-full border border-transparent",
        Platform.select({
          web: "focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex outline-none transition-colors focus-visible:ring-[3px] disabled:cursor-not-allowed",
        }),
        props.checked ? "bg-primary" : "bg-input",
        props.disabled && "opacity-50",
        className,
      )}
      // The track is smaller than a comfortable touch target.
      hitSlop={12}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "size-4 rounded-full transition-transform",
          Platform.select({
            web: "pointer-events-none block ring-0",
          }),
          // Transforms are not mirrored in right-to-left layouts, so the travel is reversed by hand.
          props.checked ? "bg-primary-foreground translate-x-3.5 rtl:-translate-x-3.5" : "bg-foreground translate-x-0",
        )}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
