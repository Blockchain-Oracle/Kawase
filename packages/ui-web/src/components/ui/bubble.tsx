"use client";

import * as React from "react";
import { cn } from "@kawase/ui-web/lib/utils";

type BubbleVariant = "default" | "muted";
type BubbleAlign = "start" | "end";

interface BubbleContextValue {
  variant: BubbleVariant;
}

const BubbleContext = React.createContext<BubbleContextValue>({
  variant: "default",
});

interface BubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BubbleVariant;
  align?: BubbleAlign;
}

function Bubble({
  variant = "default",
  align = "start",
  className,
  children,
  ...props
}: BubbleProps) {
  return (
    <BubbleContext.Provider value={{ variant }}>
      <div
        data-align={align}
        className={cn(
          "flex w-fit max-w-[85%] flex-col",
          align === "end" ? "ml-auto items-end" : "mr-auto items-start",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </BubbleContext.Provider>
  );
}

interface BubbleContentProps extends React.HTMLAttributes<HTMLDivElement> {}

function BubbleContent({ className, ...props }: BubbleContentProps) {
  const { variant } = React.useContext(BubbleContext);
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-2 text-sm",
        variant === "muted"
          ? "bg-muted text-foreground"
          : "bg-primary text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

function BubbleGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export { Bubble, BubbleContent, BubbleGroup };
