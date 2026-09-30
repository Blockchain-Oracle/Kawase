// Stage 2: three design directions for the home screen, built from the same installed 21st.dev components
// and the same content. Each phone frame scopes its own tokens (from packages/ui-tokens/directions.json),
// so the three can be compared on one page. Open /dev/directions?only=<tegami|choba|koe> to isolate one.
import directions from '@kawase/ui-tokens/directions.json';
import { Bubble, BubbleContent } from '@kawase/ui-web/components/ui/bubble';
import BottomMenu from '@kawase/ui-web/components/ui/bottom-menu';
import { Button } from '@kawase/ui-web/components/ui/button';
import { ActivityFeed, type ActivityEvent } from '@kawase/ui-web/components/ui/item-19';
import { ReceiptCard } from '@kawase/ui-web/components/ui/order-confirmation-card';
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@kawase/ui-web/components/ui/prompt-input';
import { ResponseStream } from '@kawase/ui-web/components/ui/response-stream';
import { SegmentedControl } from '@kawase/ui-web/components/ui/segmented-control';
import { AiSuggestedActions } from '@kawase/ui-web/components/ui/suggested-actions';
import { VoicePoweredOrb } from '@kawase/ui-web/components/ui/voice-powered-orb';
import { WalletCard } from '@kawase/ui-web/components/ui/wallet-card-2';
import { useLocalSearchParams } from 'expo-router';
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  CalendarClock,
  Coins,
  Euro,
  House,
  Keyboard,
  Mic,
  Paperclip,
  QrCode,
  Repeat,
  Settings,
  Users,
  Waypoints,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

type DirectionKey = 'tegami' | 'choba' | 'koe';
type Mode = 'light' | 'dark';
type Network = 'mainnet' | 'testnet';
type Tokens = Record<string, string>;
type Direction = {
  name: string;
  default: Mode;
  fonts: { display: string; body: string; mono: string };
  radius: string;
  light: Tokens;
  dark: Tokens;
  'testnet-light': Tokens;
  'testnet-dark': Tokens;
};

const DIRECTIONS = directions as unknown as Record<DirectionKey, Direction>;
const ORDER: DirectionKey[] = ['tegami', 'choba', 'koe'];
const SCRIPT_FALLBACKS =
  '"Noto Sans Arabic", "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans SC", system-ui, sans-serif';
const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=Golos+Text:wght@400..700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400..600&family=Manrope:wght@400..700&family=Newsreader:opsz,wght@6..72,400..600&display=swap';
const RADIUS_STEP = 4;
const ORB_COLORS: Record<Network, [string, string, string]> = {
  mainnet: ['#FFB224', '#FFE2A8', '#B54A00'],
  testnet: ['#4CC2FF', '#C7ECFF', '#0A4A7A'],
};

const SUMMARY: Record<DirectionKey, { idea: string; bestFor: string }> = {
  tegami: {
    idea: 'The conversation is the home screen. Money shows up inside it as receipts.',
    bestFor: 'People who just want to say what they need. Lowest learning curve.',
  },
  choba: {
    idea: 'Your money is the home screen. The agent is a command bar that is always one tap away.',
    bestFor: 'Small businesses and people who check balances and activity first.',
  },
  koe: {
    idea: 'The orb is the home screen. You talk, captions show what was heard, cards rise to be confirmed.',
    bestFor: 'Hands-free use and the strongest demo. Typing is secondary.',
  },
};

function scopedTokens(direction: Direction, mode: Mode, network: Network): CSSProperties {
  const tokens = { ...direction[mode], ...(network === 'testnet' ? direction[`testnet-${mode}`] : {}) };
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens)) style[`--color-${name}`] = value;
  const radius = Number.parseInt(direction.radius, 10);
  style['--radius'] = `${radius}px`;
  style['--radius-sm'] = `${radius - RADIUS_STEP}px`;
  style['--radius-md'] = `${radius - RADIUS_STEP / 2}px`;
  style['--radius-lg'] = `${radius}px`;
  style['--radius-xl'] = `${radius + RADIUS_STEP}px`;
  style['--font-mono'] = `"${direction.fonts.mono}", ui-monospace, monospace`;
  style['--font-display'] = `"${direction.fonts.display}", ${SCRIPT_FALLBACKS}`;
  style.fontFamily = `"${direction.fonts.body}", ${SCRIPT_FALLBACKS}`;
  style.colorScheme = mode;
  return style as CSSProperties;
}

const display: CSSProperties = { fontFamily: 'var(--font-display)' };

function TestnetStrip() {
  return (
    <div className="bg-network-surface text-network px-4 pt-11 pb-1.5 text-center text-xs font-semibold">
      Testnet · no real money
    </div>
  );
}

function NetworkChip({ network }: { network: Network }) {
  return (
    <span className="bg-network-surface text-network inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold">
      <Waypoints className="size-3.5" aria-hidden />
      {network === 'testnet' ? 'Arc Testnet' : 'Arc'}
    </span>
  );
}

function CommandBar({ placeholder }: { placeholder: string }) {
  const [value, setValue] = useState('');
  return (
    <PromptInput value={value} onValueChange={setValue} className="bg-card border-border flex items-center gap-1 rounded-xl border py-1 pe-1.5 ps-2 shadow-none">
      <PromptInputTextarea placeholder={placeholder} className="min-h-[36px] flex-1 py-2" />
      <PromptInputAction tooltip="Talk to Kawase">
        <Button variant="secondary" size="icon" className="size-9 shrink-0 rounded-full" aria-label="Talk">
          <Mic className="size-4" />
        </Button>
      </PromptInputAction>
      <PromptInputAction tooltip="Send">
        <Button size="icon" className="size-9 shrink-0 rounded-full" aria-label="Send">
          <ArrowUp className="size-4" />
        </Button>
      </PromptInputAction>
    </PromptInput>
  );
}

function Composer({ placeholder }: { placeholder: string }) {
  const [value, setValue] = useState('');
  return (
    <PromptInput value={value} onValueChange={setValue} className="bg-card border-border rounded-xl border p-2 shadow-none">
      <PromptInputTextarea placeholder={placeholder} className="min-h-[44px]" />
      <PromptInputActions className="justify-between pt-1">
        <PromptInputAction tooltip="Attach a photo or invoice">
          <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="Attach">
            <Paperclip className="size-4" />
          </Button>
        </PromptInputAction>
        <div className="flex items-center gap-1.5">
          <PromptInputAction tooltip="Talk to Kawase">
            <Button variant="secondary" size="icon" className="size-9 rounded-full" aria-label="Talk">
              <Mic className="size-4" />
            </Button>
          </PromptInputAction>
          <PromptInputAction tooltip="Send">
            <Button size="icon" className="size-9 rounded-full" aria-label="Send">
              <ArrowUp className="size-4" />
            </Button>
          </PromptInputAction>
        </div>
      </PromptInputActions>
    </PromptInput>
  );
}

// A. Tegami: conversation-first.
function TegamiScreen({ network }: { network: Network }) {
  return (
    <div className="flex h-full flex-col">
      {network === 'testnet' ? <TestnetStrip /> : null}
      <header className={`flex items-center justify-between px-5 pb-3 ${network === 'testnet' ? 'pt-3' : 'pt-12'}`}>
        <div style={display} className="text-2xl font-medium tracking-tight">
          <span className="text-accent me-1.5">為替</span>Kawase
        </div>
        <div className="border-border bg-card flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm">
          <span dir="ltr" className="font-mono tabular-nums">1,240.50</span>
          <span className="text-muted-foreground">USDC</span>
        </div>
      </header>
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden px-5 pb-3">
        <Bubble align="end">
          <BubbleContent>Send 25 USDC to Amina</BubbleContent>
        </Bubble>
        <p className="text-[15px] leading-relaxed">
          Done. Amina has it already; the fee was about a fifth of a cent.
        </p>
        <ReceiptCard
          compact
          className="max-w-none shadow-none"
          title="Sent 25 USDC to Amina"
          badge={network === 'testnet' ? 'Arc Testnet' : 'Arc'}
          details={[
            { label: 'To', value: 'Amina · 0x92Bf…c1A4' },
            { label: 'Network fee', value: '0.0021 USDC' },
            { label: 'Total', value: '25.0021 USDC', isBold: true },
          ]}
          buttonText="View receipt"
          onAction={() => undefined}
        />
      </div>
      <div className="space-y-2 px-4 pb-6">
        <AiSuggestedActions
          className="grid-cols-2 font-sans sm:grid-cols-2 [&>button]:border-border [&>button]:bg-card [&>button]:rounded-full [&>button]:px-3 [&>button]:py-2 [&>button]:text-center"
          suggestions={[
            { label: 'Split dinner with Kenji', prompt: 'Split dinner with Kenji' },
            { label: 'Pay rent every 1st', prompt: 'Pay rent every 1st' },
          ]}
        />
        <Composer placeholder="Message Kawase…" />
      </div>
    </div>
  );
}

const EVENTS: ActivityEvent[] = [
  { id: 'a', icon: <ArrowUpRight />, title: 'Sent to Amina', description: 'Arc · 2 min ago', time: 'Done', amount: '−25.00' },
  { id: 'b', icon: <ArrowDownLeft />, title: 'From Kenji Tanaka', description: 'Invoice 0042 · 09:12', time: 'Done', amount: '+120.00', tone: 'in' },
  { id: 'c', icon: <CalendarClock />, title: 'Rent to Fatima', description: 'Every 1st · in 3 days', time: 'Scheduled', amount: '−400.00' },
];

// B. Chōba: wallet-first.
function ChobaScreen({ network }: { network: Network }) {
  return (
    <div className="flex h-full flex-col">
      {network === 'testnet' ? <TestnetStrip /> : null}
      <header className={`flex items-center justify-between px-4 pb-3 ${network === 'testnet' ? 'pt-3' : 'pt-12'}`}>
        <div className="text-sm font-semibold uppercase tracking-[0.18em]">Kawase</div>
        <SegmentedControl
          label="Network"
          value={network}
          options={[
            { value: 'mainnet', label: 'Mainnet' },
            { value: 'testnet', label: 'Testnet' },
          ]}
        />
      </header>
      <div className="flex-1 space-y-3 overflow-hidden px-4">
        <WalletCard
          dense
          label="Total balance"
          amount="1,240.50 USDC"
          subAmount="≈ $1,240.62 · 2 assets"
          badge={<NetworkChip network={network} />}
          actions={[
            { id: 'send', label: 'Send', icon: <ArrowUpRight className="size-4" />, kind: 'primary' },
            { id: 'request', label: 'Request', icon: <QrCode className="size-4" />, kind: 'secondary' },
            { id: 'swap', label: 'Swap', icon: <ArrowLeftRight className="size-4" />, kind: 'icon' },
            { id: 'bridge', label: 'Bridge', icon: <Waypoints className="size-4" />, kind: 'icon' },
          ]}
          accounts={[
            { id: 'usdc', name: 'USDC', detail: 'Dollar', amount: '1,194.38', icon: <Coins className="size-4" /> },
            { id: 'eurc', name: 'EURC', detail: 'Euro', amount: '42.30', icon: <Euro className="size-4" /> },
          ]}
        />
        <div>
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Activity</h2>
            <span className="text-primary text-xs font-medium">See all</span>
          </div>
          <ActivityFeed dense events={EVENTS} />
        </div>
      </div>
      <div className="bg-background space-y-0 px-4 pb-3 pt-2">
        <CommandBar placeholder="Ask Kawase to send, swap or schedule…" />
        <BottomMenu
          active="home"
          nav={[
            { name: 'home', label: 'Home', icon: <House className="size-5" /> },
            { name: 'activity', label: 'Activity', icon: <Activity className="size-5" /> },
            { name: 'contacts', label: 'Contacts', icon: <Users className="size-5" /> },
            { name: 'automations', label: 'Automations', icon: <Repeat className="size-5" /> },
            { name: 'settings', label: 'Settings', icon: <Settings className="size-5" /> },
          ]}
        />
      </div>
    </div>
  );
}

// C. Koe: voice-first.
function KoeScreen({ network }: { network: Network }) {
  return (
    <div className="flex h-full flex-col">
      {network === 'testnet' ? <TestnetStrip /> : null}
      <header className={`flex items-center justify-between px-5 ${network === 'testnet' ? 'pt-3' : 'pt-12'}`}>
        <NetworkChip network={network} />
        <div className="flex items-center gap-3">
          <span dir="ltr" className="text-muted-foreground font-mono text-sm tabular-nums">1,240.50 USDC</span>
          <Button variant="secondary" size="icon" className="size-9 rounded-full" aria-label="Type instead">
            <Keyboard className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="size-56">
          <VoicePoweredOrb colors={ORB_COLORS[network]} enableVoiceControl={false} />
        </div>
        <div className="text-primary text-xs font-semibold uppercase tracking-[0.2em]">Listening</div>
        <p className="text-muted-foreground text-center text-sm">“Send twenty-five USDC to Amina”</p>
        <div style={display} className="text-center text-[26px] font-medium leading-tight tracking-tight">
          <ResponseStream mode="fade" speed={80} textStream="Sending 25 USDC to Amina. Say confirm, or hold the button." />
        </div>
      </div>
      <div className="border-border bg-card rounded-t-[28px] border-t px-5 pb-7 pt-3">
        <div className="bg-muted mx-auto mb-4 h-1 w-10 rounded-full" />
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-sm">Send</span>
          <span dir="ltr" className="font-mono text-2xl font-semibold tabular-nums">25.00 USDC</span>
        </div>
        <div className="flex items-baseline justify-between pb-4 pt-1">
          <span className="text-muted-foreground text-sm">To</span>
          <span className="text-sm">
            Amina · <span dir="ltr" className="font-mono">0x92Bf…c1A4</span>
          </span>
        </div>
        <Button className="h-14 w-full rounded-full text-base font-semibold">Hold to confirm</Button>
      </div>
    </div>
  );
}

const SCREENS: Record<DirectionKey, (props: { network: Network }) => ReactNode> = {
  tegami: TegamiScreen,
  choba: ChobaScreen,
  koe: KoeScreen,
};

function Phone({ id, mode, network }: { id: DirectionKey; mode: Mode; network: Network }) {
  const Screen = SCREENS[id];
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <div
        data-frame={`${id}-${mode}-${network}`}
        style={scopedTokens(DIRECTIONS[id], mode, network)}
        className="bg-background text-foreground relative h-[844px] w-[390px] overflow-hidden rounded-[44px] border-[6px] border-black"
      >
        <Screen network={network} />
      </div>
      <figcaption className="text-sm text-neutral-600">
        {mode} · {network}
      </figcaption>
    </figure>
  );
}

export function DirectionsPreview() {
  const { only } = useLocalSearchParams<{ only?: string }>();
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
  const shown = ORDER.filter((id) => !only || only === id);

  return (
    <div className="min-h-screen overflow-auto bg-neutral-200 p-8 text-neutral-900" style={{ fontFamily: 'system-ui' }}>
      <h1 className="text-2xl font-semibold">Kawase · three home-screen directions</h1>
      <p className="max-w-3xl pt-1 text-sm text-neutral-600">
        Same content, same installed components, same four themes. Each pair shows the direction in its default mode on
        mainnet, then in the other mode on testnet.
      </p>
      <div className="flex flex-wrap gap-10 pt-6">
        {shown.map((id) => {
          const direction = DIRECTIONS[id];
          const other: Mode = direction.default === 'light' ? 'dark' : 'light';
          return (
            <section key={id} className="space-y-3">
              <div className="max-w-[800px]">
                <h2 className="text-lg font-semibold">{direction.name}</h2>
                <p className="text-sm text-neutral-700">{SUMMARY[id].idea}</p>
                <p className="text-sm text-neutral-500">Best for: {SUMMARY[id].bestFor}</p>
              </div>
              <div className="flex gap-6">
                <Phone id={id} mode={direction.default} network="mainnet" />
                <Phone id={id} mode={other} network="testnet" />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
