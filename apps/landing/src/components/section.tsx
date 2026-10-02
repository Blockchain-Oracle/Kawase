import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** One landing section: a small eyebrow, a display heading, a muted line, then the content. */
export function Section({
  id,
  eyebrow,
  title,
  body,
  children,
  className,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  body?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 px-6 py-20 sm:py-28", className)}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
          {body ? <div className="mt-4 text-base leading-relaxed text-muted-foreground">{body}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
