// The judge kit: every way to try or check Kawase, in one grid. TestFlight shows "Invite only" until a public link
// is set (NEXT_PUBLIC_TESTFLIGHT_URL); nothing links to a page that does not exist.
import { Activity, BookOpen, Laptop, Receipt } from "lucide-react";

import { FAUCET } from "@kawase/config";
import { Mark } from "@kawase/ui-web/components/mark";

import { AndroidMark, GitHubMark } from "@/components/brand-marks";
import { Section } from "@/components/section";
import { ResourceCardsGrid, type ResourceCardItem } from "@/components/ui/resource-cards-grid";
import { ENTITY } from "@/lib/capabilities";
import { links } from "@/lib/links";

const ICON = 40;
const GLYPH = "size-8 text-foreground";

const ITEMS: readonly ResourceCardItem[] = [
  {
    icon: <Mark entity={ENTITY.kawase} size={ICON} />,
    title: "Web app",
    subtitle: "Try it as a guest, no sign-up",
    href: links.webApp,
  },
  {
    icon: <Mark entity={ENTITY.apple} size={ICON} />,
    title: "iPhone (TestFlight)",
    subtitle: "The native app with Face ID and voice",
    href: links.testFlight,
    unavailableLabel: "Invite only",
  },
  {
    icon: <AndroidMark className={GLYPH} />,
    title: "Android",
    subtitle: "Install the preview build (APK)",
    href: links.androidApk,
  },
  {
    icon: <Laptop className={GLYPH} aria-hidden />,
    title: "Mac (preview)",
    subtitle: "Apple silicon. Not yet notarized by Apple: the first time, right-click Kawase → Open",
    href: links.desktopMac,
  },
  {
    icon: <BookOpen className={GLYPH} aria-hidden />,
    title: "Docs",
    subtitle: "Guides, safety model, architecture",
    href: `${links.docs}/docs`,
  },
  {
    icon: <GitHubMark className={GLYPH} />,
    title: "Source",
    subtitle: "The whole monorepo on GitHub",
    href: links.github,
  },
  {
    icon: <Receipt className={GLYPH} aria-hidden />,
    title: "Demo and evidence",
    subtitle: "The video and every transaction behind it",
    href: "/demo",
  },
  {
    icon: <Activity className={GLYPH} aria-hidden />,
    title: "Live counts",
    subtitle: "What Kawase has done so far, per network",
    href: "/live",
  },
  {
    icon: <Mark entity={ENTITY.circle} size={ICON} />,
    title: "Test USDC",
    subtitle: "Circle's faucet, if you bring your own wallet",
    href: FAUCET.circleFaucetUrl,
  },
];

export function JudgeKit() {
  return (
    <Section
      id="judge-kit"
      eyebrow="Judge kit"
      title="Try it, read it, check it"
      body="The fastest path: open the web app as a guest, ask it something in your language, then check the evidence page for the transactions behind each claim."
    >
      <ResourceCardsGrid items={ITEMS} className="lg:grid-cols-3" />
    </Section>
  );
}
