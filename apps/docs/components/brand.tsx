import { MARKS } from "@kawase/identity/web";

const MARK_SIZE = 24;
const KawaseMark = MARKS.kawase;

/** The Kawase mark (為替 on ink, lime frame) and the wordmark. */
export function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="block overflow-hidden rounded-md" style={{ width: MARK_SIZE, height: MARK_SIZE }}>
        <KawaseMark width={MARK_SIZE} height={MARK_SIZE} aria-hidden />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight">Kawase</span>
    </span>
  );
}
