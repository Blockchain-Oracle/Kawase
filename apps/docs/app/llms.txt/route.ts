import { i18n } from "@/lib/i18n";
import { links } from "@/lib/shared";
import { docsLlms } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const others = i18n.languages.filter((lang) => lang !== i18n.defaultLanguage).map((lang) => `/${lang}/docs`);
  const header = [
    "# Kawase",
    "",
    "> Kawase (為替) is an AI money app for everything on Arc (Circle's stablecoin L1). Ask by voice or text in ten languages; the agent proposes, the person approves, and on-chain limits bound what it can do.",
    "",
    `- Web app: ${links.webApp}`,
    `- Full docs as one file: ${links.docs}/llms-full.txt`,
    `- Every page has a Markdown twin: append \`.md\` to its URL.`,
    `- Other languages: ${others.join(", ")}`,
    "",
  ].join("\n");
  return new Response(header + (await docsLlms.index(i18n.defaultLanguage)), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
