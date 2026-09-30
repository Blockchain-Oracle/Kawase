// Reskinned for Kawase (Lime on Ink): pill radius, no shadows, tall touch targets like the references' CTAs, and quiet
// states use `muted` (lime is kept for the primary action).
import { TextClassContext } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable } from "react-native";

const buttonVariants = cva(
  cn(
    "group shrink-0 flex-row items-center justify-center gap-2 rounded-full",
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive whitespace-nowrap outline-none transition-[color,background-color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    }),
  ),
  {
    variants: {
      variant: {
        default: cn("bg-primary active:bg-primary/90", Platform.select({ web: "hover:bg-primary/90" })),
        destructive: cn(
          "bg-destructive active:bg-destructive/90",
          Platform.select({
            web: "hover:bg-destructive/90 focus-visible:ring-destructive/20",
          }),
        ),
        outline: cn(
          "border-border bg-background active:bg-muted border",
          Platform.select({
            web: "hover:bg-muted",
          }),
        ),
        secondary: cn("bg-secondary active:bg-secondary/80", Platform.select({ web: "hover:bg-secondary/80" })),
        ghost: cn("active:bg-muted", Platform.select({ web: "hover:bg-muted" })),
        link: "",
      },
      size: {
        default: cn("h-12 px-5 py-2", Platform.select({ web: "has-[>svg]:px-4" })),
        sm: cn("h-9 gap-1.5 px-3.5", Platform.select({ web: "has-[>svg]:px-2.5" })),
        lg: cn("h-14 px-7", Platform.select({ web: "has-[>svg]:px-5" })),
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const buttonTextVariants = cva(
  cn("text-foreground text-base font-semibold", Platform.select({ web: "pointer-events-none transition-colors" })),
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        destructive: "text-destructive-foreground",
        outline: "",
        secondary: "text-secondary-foreground",
        ghost: "",
        link: cn(
          "text-primary group-active:underline",
          Platform.select({ web: "underline-offset-4 hover:underline group-hover:underline" }),
        ),
      },
      size: {
        default: "",
        sm: "text-sm",
        lg: "text-lg",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(props.disabled && "opacity-50", buttonVariants({ variant, size }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
