"use client";
// The docs' 404 (Abu, 10-16: "our custom 404 page… everywhere"), told the way the app and the landing tell it: Kawase's
// receipt slip, voided — the address tried, "No such page", the reader's money right where they left it, a vermilion
// VOID stamp where a real slip has its hanko — and the ways on: search the docs, back to the docs, open the app. In the
// reader's language (the URL's), inside the docs' own navigation.
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Brand } from "@/components/brand";
import { links } from "@/lib/shared";

type Copy = { title: string; line: string; to: string; status: string; missing: string; money: string; safe: string; search: string; back: string; app: string };

const COPY: Record<string, Copy> = {
  en: { title: "Nothing moved.", line: "There's no guide at this address, and nothing left anyone's wallet.", to: "To", status: "Status", missing: "No such page", money: "Your money", safe: "Right where you left it", search: "Search the docs", back: "Back to the docs", app: "Open Kawase" },
  zh: { title: "什么都没动。", line: "这个地址没有指南，也没有任何人的资金流出。", to: "去往", status: "状态", missing: "没有这个页面", money: "你的钱", safe: "原封不动", search: "搜索文档", back: "返回文档", app: "打开 Kawase" },
  hi: { title: "कुछ नहीं हिला।", line: "इस पते पर कोई गाइड नहीं है, और किसी के वॉलेट से कुछ नहीं गया।", to: "प्रति", status: "स्थिति", missing: "ऐसा कोई पेज नहीं", money: "आपका पैसा", safe: "ठीक वहीं जहाँ आपने छोड़ा था", search: "डॉक्स खोजें", back: "डॉक्स पर लौटें", app: "Kawase खोलें" },
  es: { title: "No se movió nada.", line: "No hay ninguna guía en esta dirección, y nada salió de ninguna billetera.", to: "Para", status: "Estado", missing: "No existe esta página", money: "Tu dinero", safe: "Justo donde lo dejaste", search: "Buscar en la documentación", back: "Volver a la documentación", app: "Abrir Kawase" },
  fr: { title: "Rien n'a bougé.", line: "Aucun guide à cette adresse, et rien n'a quitté aucun portefeuille.", to: "À", status: "Statut", missing: "Page introuvable", money: "Votre argent", safe: "Exactement là où vous l'avez laissé", search: "Rechercher dans la doc", back: "Retour à la doc", app: "Ouvrir Kawase" },
  ar: { title: "لم يتحرّك شيء.", line: "لا يوجد دليل على هذا العنوان، ولم يخرج شيء من أي محفظة.", to: "إلى", status: "الحالة", missing: "لا توجد صفحة كهذه", money: "أموالك", safe: "في مكانها تمامًا", search: "ابحث في الوثائق", back: "عودة إلى الوثائق", app: "افتح Kawase" },
  bn: { title: "কিছুই সরেনি।", line: "এই ঠিকানায় কোনো গাইড নেই, আর কারও ওয়ালেট থেকে কিছুই যায়নি।", to: "প্রাপক", status: "অবস্থা", missing: "এমন কোনো পাতা নেই", money: "আপনার টাকা", safe: "যেখানে রেখেছিলেন সেখানেই", search: "ডকসে খুঁজুন", back: "ডকসে ফিরুন", app: "Kawase খুলুন" },
  pt: { title: "Nada se moveu.", line: "Não há guia neste endereço, e nada saiu da carteira de ninguém.", to: "Para", status: "Status", missing: "Página inexistente", money: "Seu dinheiro", safe: "Exatamente onde você deixou", search: "Buscar na documentação", back: "Voltar à documentação", app: "Abrir a Kawase" },
  ru: { title: "Ничего не сдвинулось.", line: "По этому адресу нет руководства, и ни из чьего кошелька ничего не ушло.", to: "Кому", status: "Статус", missing: "Такой страницы нет", money: "Ваши деньги", safe: "Там же, где вы их оставили", search: "Поиск по документации", back: "Назад к документации", app: "Открыть Kawase" },
  ur: { title: "کچھ نہیں ہلا۔", line: "اس پتے پر کوئی گائیڈ نہیں، اور کسی کے والٹ سے کچھ نہیں گیا۔", to: "بنام", status: "حالت", missing: "ایسا کوئی صفحہ نہیں", money: "آپ کی رقم", safe: "بالکل وہیں جہاں آپ نے چھوڑی", search: "دستاویزات میں تلاش کریں", back: "دستاویزات پر واپس", app: "Kawase کھولیں" },
};

const noStore = () => () => undefined;
const addressPath = () => window.location.pathname;
const noPath = () => null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="text-sm text-fd-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-end text-[15px] font-semibold">{children}</dd>
    </div>
  );
}

export function NotFoundPage() {
  const params = useParams<{ lang?: string }>();
  const copy = COPY[params?.lang ?? "en"] ?? COPY.en!;
  const home = params?.lang && params.lang !== "en" ? `/${params.lang}/docs` : "/docs";
  const path = useSyncExternalStore(noStore, addressPath, noPath);
  const search = useSearchContext();
  return (
    <main id="nd-not-found" className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center gap-12 px-5 py-20 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-[520px]">
        <p className="text-sm font-semibold tracking-[0.14em] text-fd-muted-foreground uppercase">404</p>
        <h1 className="mt-3 font-display text-[clamp(44px,7vw,84px)] leading-[0.95] font-black">{copy.title}</h1>
        <p className="mt-5 text-lg text-fd-muted-foreground">{copy.line}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {search.enabled ? (
            <button type="button" onClick={() => search.setOpenSearch(true)} className="inline-flex h-11 items-center rounded-full bg-fd-primary px-5 text-sm font-semibold text-fd-primary-foreground">
              {copy.search}
            </button>
          ) : null}
          <a href={home} className="inline-flex h-11 items-center rounded-full border border-fd-border bg-fd-card px-5 text-sm font-semibold">
            {copy.back}
          </a>
          <a href={links.webApp} className="inline-flex h-11 items-center rounded-full border border-fd-border bg-fd-card px-5 text-sm font-semibold">
            {copy.app}
          </a>
        </div>
      </div>
      <figure className="relative w-full max-w-[400px] overflow-hidden rounded-[26px] border border-fd-border bg-fd-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.45)]" aria-label="404">
        <div className="flex items-center gap-2.5 px-6 pt-6">
          <Brand />
          <span className="ms-auto text-xs font-semibold tracking-[0.14em] text-fd-muted-foreground uppercase">#404</span>
        </div>
        <dl className="grid gap-3.5 px-6 py-6">
          <Row label={copy.to}>
            <span className="font-mono text-sm" dir="ltr">{path ?? "—"}</span>
          </Row>
          <Row label={copy.status}>{copy.missing}</Row>
          <Row label={copy.money}>
            <span className="text-[#2F7A00] dark:text-[#B5F543]">{copy.safe}</span>
          </Row>
        </dl>
        <span aria-hidden className="pointer-events-none absolute top-[70px] end-5 -rotate-12 rounded-md border-[3px] border-[#E0463D] px-2.5 py-0.5 font-display text-xl font-black tracking-[0.18em] text-[#E0463D] opacity-85">
          VOID
        </span>
        <div className="relative" aria-hidden>
          <div className="mx-6 border-t-2 border-dashed border-fd-border" />
          <span className="absolute top-1/2 -start-3 size-6 -translate-y-1/2 rounded-full bg-fd-background" />
          <span className="absolute top-1/2 -end-3 size-6 -translate-y-1/2 rounded-full bg-fd-background" />
        </div>
        <figcaption className="px-6 py-5 text-sm text-fd-muted-foreground">docs.getkawase.xyz</figcaption>
      </figure>
    </main>
  );
}
