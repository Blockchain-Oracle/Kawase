// Source: 21st.dev coss.com/table (https://21st.dev/@coss.com/components/table). Changes for Kawase: header cells
// align to the reading start (`text-start`, so Arabic and Urdu mirror); hover and selection fills use `muted`.
import { cn } from "@/lib/utils";
import type * as React from "react";

export function Table({ className, ...props }: React.ComponentProps<"table">): React.ReactElement {
  return (
    <div className="relative w-full overflow-x-auto" data-slot="table-container">
      <table
        className={cn(
          "w-full caption-bottom in-data-[slot=frame]:border-separate in-data-[slot=frame]:border-spacing-0 text-sm",
          className,
        )}
        data-slot="table"
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">): React.ReactElement {
  return (
    <thead
      className={cn(
        "[&_tr]:border-b in-data-[slot=frame]:**:[th]:h-9 in-data-[slot=frame]:*:[tr]:border-none in-data-[slot=frame]:*:[tr]:hover:bg-transparent",
        className,
      )}
      data-slot="table-header"
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">): React.ReactElement {
  return (
    <tbody className={cn("relative [&_tr:last-child]:border-0", className)} data-slot="table-body" {...props} />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">): React.ReactElement {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted",
        className,
      )}
      data-slot="table-row"
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">): React.ReactElement {
  return (
    <th
      className={cn(
        "h-10 whitespace-nowrap px-2.5 text-start align-middle font-medium text-muted-foreground leading-none",
        className,
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">): React.ReactElement {
  return (
    <td className={cn("whitespace-nowrap p-2.5 align-middle leading-none", className)} data-slot="table-cell" {...props} />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">): React.ReactElement {
  return (
    <caption className={cn("mt-4 text-muted-foreground text-sm", className)} data-slot="table-caption" {...props} />
  );
}
