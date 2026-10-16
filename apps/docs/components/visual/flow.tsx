// A flow drawn as boxes and arrows: what happens, in order, and where it branches. Text comes from the page's MDX so
// every language translates it; the arrows are drawn here. Up to four columns run across when the column is wide
// enough; longer flows, and every flow on a phone, run down. Right-to-left pages mirror it.
//
//   <Flow>
//     <FlowStep icon="at-sign" title="Who">A contact, an @handle or an address</FlowStep>
//     <FlowFork>
//       <FlowStep when="Inside your budget" icon="zap" title="Sent at once" />
//       <FlowStep when="Anything else" icon="fingerprint" title="You confirm" tone="accent" />
//     </FlowFork>
//     <FlowStep icon="receipt" title="Receipt" tone="ink" />
//   </Flow>
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import {
  ArrowLeftRight,
  AtSign,
  BadgeCheck,
  Banknote,
  Bell,
  Bot,
  CalendarClock,
  ChartCandlestick,
  Check,
  CircleDollarSign,
  Clock,
  Coins,
  Download,
  CreditCard,
  Eye,
  Fingerprint,
  Globe,
  Hand,
  Inbox,
  KeyRound,
  Landmark,
  Link2,
  ListChecks,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  Network,
  Pause,
  PiggyBank,
  QrCode,
  Receipt,
  Repeat,
  Route,
  ScanLine,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Target,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRound,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Mark } from "@kawase/ui-web/components/mark";

import { markEntity } from "../marks";
import { cx } from "./device";

const ICONS: Record<string, LucideIcon> = {
  "arrow-left-right": ArrowLeftRight,
  "at-sign": AtSign,
  "badge-check": BadgeCheck,
  banknote: Banknote,
  bell: Bell,
  bot: Bot,
  calendar: CalendarClock,
  candles: ChartCandlestick,
  check: Check,
  dollar: CircleDollarSign,
  clock: Clock,
  coins: Coins,
  card: CreditCard,
  eye: Eye,
  fingerprint: Fingerprint,
  globe: Globe,
  hand: Hand,
  inbox: Inbox,
  key: KeyRound,
  bank: Landmark,
  link: Link2,
  list: ListChecks,
  lock: Lock,
  mail: Mail,
  chat: MessageSquare,
  mic: Mic,
  network: Network,
  pause: Pause,
  savings: PiggyBank,
  qr: QrCode,
  receipt: Receipt,
  repeat: Repeat,
  route: Route,
  scan: ScanLine,
  search: Search,
  send: Send,
  settings: Settings2,
  share: Share2,
  shield: ShieldCheck,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  store: Store,
  target: Target,
  toggle: ToggleRight,
  down: TrendingDown,
  install: Download,
  up: TrendingUp,
  "user-plus": UserPlus,
  user: UserRound,
  wallet: Wallet,
  zap: Zap,
};

type Tone = "default" | "accent" | "ink" | "quiet";

interface FlowStepProps {
  title: string;
  /** A Lucide icon by its short name (ICONS), or a real logo with `mark`. */
  icon?: string;
  mark?: string;
  /** On a branch: the condition that leads here. */
  when?: string;
  tone?: Tone;
  children?: ReactNode;
}

/** One box. Only read by Flow and FlowFork. */
export function FlowStep(_props: FlowStepProps): null {
  return null;
}

/** Two or three boxes side by side (or stacked, across): the flow takes one of them. */
export function FlowFork(_props: { children?: ReactNode }): null {
  return null;
}

type Item = { kind: "step"; props: FlowStepProps } | { kind: "fork"; branches: FlowStepProps[] };

const stepsIn = (children: ReactNode) =>
  Children.toArray(children)
    .filter((child): child is ReactElement<FlowStepProps> => isValidElement(child) && child.type === FlowStep)
    .map((child) => child.props);

const MAX_ACROSS = 4;

export function Flow({ children, direction }: { children?: ReactNode; direction?: "auto" | "down" }) {
  const items: Item[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    if (child.type === FlowStep) items.push({ kind: "step", props: (child as ReactElement<FlowStepProps>).props });
    else if (child.type === FlowFork) {
      const branches = stepsIn((child as ReactElement<{ children?: ReactNode }>).props.children);
      if (branches.length > 0) items.push({ kind: "fork", branches });
    }
  });
  const across = direction !== "down" && items.length <= MAX_ACROSS;
  let number = 0;
  return (
    <div className="kv-flow not-prose" data-across={across || undefined} role="list">
      <div className="kv-flow-track">
        {items.map((item, index) => {
          const previous = items[index - 1];
          const connector =
            index === 0 ? null : item.kind === "fork" ? (
              <Split key={`c${index}`} count={item.branches.length} index={index} />
            ) : previous?.kind === "fork" ? (
              <Merge key={`c${index}`} count={previous.branches.length} index={index} />
            ) : (
              <Arrow key={`c${index}`} index={index} />
            );
          const node =
            item.kind === "step" ? (
              <Node key={`n${index}`} props={item.props} n={++number} index={index} />
            ) : (
              <div key={`n${index}`} className="kv-flow-fork" style={{ ["--n" as string]: item.branches.length }}>
                {item.branches.map((branch, b) => (
                  <div key={b} className="kv-flow-branch">
                    <Node props={branch} index={index} />
                  </div>
                ))}
              </div>
            );
          return [connector, node];
        })}
      </div>
    </div>
  );
}

function Node({ props, n, index }: { props: FlowStepProps; n?: number; index: number }) {
  const Icon = props.icon ? ICONS[props.icon] : undefined;
  if (props.icon && !Icon) throw new Error(`<FlowStep icon="${props.icon}"> is not in flow.tsx's ICONS`);
  return (
    <div className={cx("kv-node", `kv-tone-${props.tone ?? "default"}`)} role="listitem" style={{ ["--i" as string]: index }}>
      <div className="kv-node-head">
        {n !== undefined ? <span className="kv-node-n">{n}</span> : null}
        {props.when ? <span className="kv-node-when">{props.when}</span> : null}
        <span className="kv-node-glyph" aria-hidden>
          {props.mark ? <Mark entity={markEntity(props.mark)} size={20} /> : Icon ? <Icon className="size-[18px]" strokeWidth={2} /> : null}
        </span>
      </div>
      <div className="kv-node-title">{props.title}</div>
      {props.children ? <div className="kv-node-body">{props.children}</div> : null}
    </div>
  );
}

/** A straight arrow; across it points to the inline end, down it points down. */
function Arrow({ index }: { index: number }) {
  return (
    <div className="kv-conn kv-conn-straight" aria-hidden style={{ ["--i" as string]: index }}>
      <svg className="kv-conn-h" viewBox="0 0 40 12" width="40" height="12">
        <path d="M2 6H31" className="kv-line" />
        <path d="M30 1.5L38 6L30 10.5Z" className="kv-head" />
      </svg>
      <svg className="kv-conn-v" viewBox="0 0 12 30" width="12" height="30">
        <path d="M6 2V21" className="kv-line" />
        <path d="M1.5 20L6 28L10.5 20Z" className="kv-head" />
      </svg>
      <span className="kv-conn-spark" />
    </div>
  );
}

const centres = (count: number) => Array.from({ length: count }, (_, i) => ((2 * i + 1) / (2 * count)) * 100);

/** One line in, one curve to each branch. The curves stretch with the fork; the heads are drawn at fixed size. */
function Split({ count, index }: { count: number; index: number }) {
  const ends = centres(count);
  return (
    <div className="kv-conn kv-conn-fork" aria-hidden style={{ ["--i" as string]: index, ["--n" as string]: count }}>
      <svg className="kv-conn-h" viewBox="0 0 40 100" preserveAspectRatio="none">
        {ends.map((y) => (
          <path key={y} d={`M0 50C18 50 16 ${y} 32 ${y}`} className="kv-line" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <svg className="kv-conn-v" viewBox="0 0 100 32" preserveAspectRatio="none">
        {ends.map((x) => (
          <path key={x} d={`M50 0C50 16 ${x} 12 ${x} 24`} className="kv-line" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {ends.map((at) => (
        <span key={at} className="kv-fork-head" style={{ ["--at" as string]: `${at}%` }}>
          <Head />
        </span>
      ))}
    </div>
  );
}

/** Each branch's line comes back into one. */
function Merge({ count, index }: { count: number; index: number }) {
  const starts = centres(count);
  return (
    <div className="kv-conn kv-conn-fork kv-conn-merge" aria-hidden style={{ ["--i" as string]: index, ["--n" as string]: count }}>
      <svg className="kv-conn-h" viewBox="0 0 40 100" preserveAspectRatio="none">
        {starts.map((y) => (
          <path key={y} d={`M0 ${y}C16 ${y} 18 50 32 50`} className="kv-line" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <svg className="kv-conn-v" viewBox="0 0 100 32" preserveAspectRatio="none">
        {starts.map((x) => (
          <path key={x} d={`M${x} 0C${x} 12 50 12 50 24`} className="kv-line" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span className="kv-fork-head kv-merge-head">
        <Head />
      </span>
    </div>
  );
}

/** The arrowhead used at the end of a curve, pointing along the flow (CSS turns it for flows that run down). */
function Head() {
  return (
    <svg viewBox="0 0 8 9" width="8" height="9">
      <path d="M0 0L8 4.5L0 9Z" className="kv-head" />
    </svg>
  );
}
