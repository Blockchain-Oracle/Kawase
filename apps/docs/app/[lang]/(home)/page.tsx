import Link from "next/link";
import { BookOpen, Cpu, ShieldCheck, Table2 } from "lucide-react";

import { Marks } from "@/components/marks";
import { i18n } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { links } from "@/lib/shared";

const docsHref = (lang: string, path = "") => `${lang === i18n.defaultLanguage ? "" : `/${lang}`}/docs${path}`;

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  const t = getMessages(lang);
  const cards = [
    { key: "gettingStarted", href: docsHref(lang, "/getting-started"), Icon: BookOpen },
    { key: "safety", href: docsHref(lang, "/safety"), Icon: ShieldCheck },
    { key: "availability", href: docsHref(lang, "/availability"), Icon: Table2 },
    { key: "architecture", href: docsHref(lang, "/architecture"), Icon: Cpu },
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-16 md:py-24">
      <section className="flex flex-col gap-6">
        <p className="text-sm font-medium text-muted-foreground">{t.home.eyebrow}</p>
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          {t.home.title}
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">{t.home.body}</p>
        <Marks names="usdc eurc arc circle morpho" size={32} />
        <div className="flex flex-wrap gap-3">
          <Link
            href={docsHref(lang)}
            className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t.home.start}
          </Link>
          <a
            href={links.webApp}
            className="inline-flex h-11 items-center rounded-full bg-secondary px-6 text-sm font-semibold text-secondary-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t.nav.webApp}
          </a>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ key, href, Icon }) => (
          <Link
            key={key}
            href={href}
            className="group flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            <span className="font-display text-lg font-semibold">{t.home.cards[key].title}</span>
            <span className="text-sm text-muted-foreground">{t.home.cards[key].body}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
