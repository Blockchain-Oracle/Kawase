// "What it does": every area of the product as a bento card whose state comes from the capability registry. Shipped
// cards quote the registry's own "runs today" and "not yet" lines, so no card reads broader than the product.
import { Mark } from "@kawase/ui-web/components/mark";

import { Section } from "@/components/section";
import { StateChip } from "@/components/state-chip";
import { BentoGrid, type BentoItem } from "@/components/ui/bento-grid";
import { AREAS, ENTITY, areaState, isShipped, nextLine, todayLine, type Area } from "@/lib/capabilities";
import { links } from "@/lib/links";

const MARK_SIZE = 26;

function status(area: Area) {
  const main = areaState(area.id, "mainnet");
  const test = areaState(area.id, "testnet");
  if (main === test) return <StateChip state={main} />;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      <StateChip state={main} prefix="Mainnet" />
      <StateChip state={test} prefix="Testnet" />
    </span>
  );
}

function footnote(area: Area) {
  const today = todayLine(area.id);
  const next = nextLine(area.id);
  if (!today) return undefined;
  return (
    <>
      <p>
        <span className="font-semibold text-success">Today: </span>
        {today}.
      </p>
      {next ? (
        <p className="mt-1 text-muted-foreground">
          <span className="font-semibold">Not yet: </span>
          {next}.
        </p>
      ) : null}
    </>
  );
}

const toItem = (area: Area): BentoItem => ({
  key: area.id,
  title: area.title,
  description: area.body,
  status: status(area),
  icon: area.marks?.map((name) => <Mark key={name} entity={ENTITY[name]} size={MARK_SIZE} />),
  tags: area.partners,
  footnote: footnote(area),
  colSpan: area.wide ? 2 : 1,
  muted: !isShipped(area.id),
  href: `${links.docs}${area.docs}`,
});

export function Capabilities() {
  const shipped = AREAS.filter((area) => isShipped(area.id)).length;
  return (
    <Section
      id="capabilities"
      eyebrow="What it does"
      title="One app for everything on Arc"
      body={
        <>
          Any token, trading, buying with Apple Pay, yield, borrowing, bridges, withdrawals, automations and paid AI
          services, all from one conversation. {shipped} of these {AREAS.length} run today; the rest are marked
          “Coming” from the same registry the app and its agent read, so this page can’t claim more than the product
          does. The <a className="underline underline-offset-4 hover:text-foreground" href={`${links.docs}/docs/availability`}>availability matrix</a> has every network.
        </>
      }
    >
      <BentoGrid items={AREAS.map(toItem)} />
    </Section>
  );
}
