// The Kawase mark (from @kawase/identity) and wordmark. The mark carries 為替; the wordmark is "Kawase" (DESIGN.md).
import { Mark } from "@kawase/ui-web/components/mark";

import { ENTITY } from "@/lib/capabilities";

const MARK_SIZE = 28;

export function Brand({ size = MARK_SIZE }: { size?: number }) {
  return (
    <a href="/" className="inline-flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-ring">
      <Mark entity={ENTITY.kawase} size={size} />
      <span className="font-display text-base font-semibold tracking-tight">Kawase</span>
    </a>
  );
}
