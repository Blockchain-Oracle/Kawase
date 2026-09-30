// Amounts, addresses and anything numeric: mono, tabular figures, always left-to-right (DESIGN.md).
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import type * as React from "react";

function Amount({ className, style, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("font-mono tabular-nums", className)} style={[{ writingDirection: "ltr" }, style]} {...props} />
  );
}

export { Amount };
