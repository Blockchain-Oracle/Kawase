// Source: 21st.dev felipemenezes098/item-19 (Activity Feed). Reskinned for Kawase: the events come from
// props, and each row can show an amount at the end. Layout and the Item primitives are unchanged.
import * as React from "react";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@kawase/ui-web/components/ui/item";
import { cn } from "@kawase/ui-web/lib/utils";

export interface ActivityEvent {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
  amount?: string;
  tone?: "in" | "out" | "neutral";
}

export function ActivityFeed({ events, dense = false, className }: { events: ActivityEvent[]; dense?: boolean; className?: string }) {
  return (
    <ItemGroup className={cn("w-full", className)}>
      {events.map((event, index) => (
        <div key={event.id}>
          <Item size={dense ? "sm" : "default"} className={dense ? "px-0" : undefined}>
            <ItemMedia variant="icon">{event.icon}</ItemMedia>
            <ItemContent>
              <ItemTitle>{event.title}</ItemTitle>
              <ItemDescription>{event.description}</ItemDescription>
            </ItemContent>
            <ItemFooter className="basis-auto flex-col items-end gap-0.5">
              {event.amount ? (
                <span dir="ltr" className={cn("font-mono text-sm tabular-nums", event.tone === "in" ? "text-success" : "text-foreground")}>
                  {event.amount}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">{event.time}</span>
            </ItemFooter>
          </Item>
          {index < events.length - 1 && <ItemSeparator />}
        </div>
      ))}
    </ItemGroup>
  );
}

export default ActivityFeed;
