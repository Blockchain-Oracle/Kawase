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
    <main className="relative flex w-full flex-1 flex-col overflow-hidden">
      {/* The README banner's light (the landing's too): magenta low on the right, a faint second one at the top left. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(900px_620px_at_88%_86%,rgb(250_0_255/0.16),transparent_70%),radial-gradient(700px_520px_at_4%_0%,rgb(250_0_255/0.07),transparent_70%)] dark:[background:radial-gradient(900px_620px_at_88%_86%,rgb(250_0_255/0.26),transparent_70%),radial-gradient(700px_520px_at_4%_0%,rgb(250_0_255/0.1),transparent_70%)]"
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-16 md:py-24">
      <section className="flex flex-col gap-6">
        <p className="text-sm font-medium text-muted-foreground">{t.home.eyebrow}</p>
        <h1 className="max-w-3xl font-display text-5xl leading-[0.95] font-black tracking-[-0.01em] md:text-7xl">
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
            className="group flex flex-col gap-3 rounded-[28px] border border-border bg-card p-6 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-accent/50 hover:shadow-[0_18px_50px_-20px_rgb(250_0_255/0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="inline-flex size-11 items-center justify-center rounded-[14px] bg-foreground text-background">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="font-display text-xl font-bold">{t.home.cards[key].title}</span>
            <span className="text-sm text-muted-foreground">{t.home.cards[key].body}</span>
          </Link>
        ))}
      </section>
      </div>
    </main>
  );
}
