// Native twin of ui-web's bubble (21st.dev bundui/bubble6), same parts.
import { Text, TextClassContext } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { View, type ViewProps } from "react-native";

type BubbleVariant = "default" | "muted";
type BubbleAlign = "start" | "end";

const BubbleContext = React.createContext<{ variant: BubbleVariant }>({ variant: "default" });

type BubbleProps = ViewProps & {
  variant?: BubbleVariant;
  align?: BubbleAlign;
};

function Bubble({ variant = "default", align = "start", className, ...props }: BubbleProps) {
  return (
    <BubbleContext.Provider value={{ variant }}>
      <View
        className={cn("max-w-[85%]", align === "end" ? "items-end self-end" : "items-start self-start", className)}
        {...props}
      />
    </BubbleContext.Provider>
  );
}

function BubbleContent({ className, children, ...props }: ViewProps) {
  const { variant } = React.useContext(BubbleContext);
  return (
    <TextClassContext.Provider
      value={cn("text-sm", variant === "muted" ? "text-foreground" : "text-primary-foreground")}
    >
      <View
        className={cn("rounded-2xl px-4 py-2", variant === "muted" ? "bg-muted" : "bg-primary", className)}
        {...props}
      >
        {typeof children === "string" ? <Text>{children}</Text> : children}
      </View>
    </TextClassContext.Provider>
  );
}

function BubbleGroup({ className, ...props }: ViewProps) {
  return <View className={cn("gap-1", className)} {...props} />;
}

export { Bubble, BubbleContent, BubbleGroup };
export type { BubbleProps };
