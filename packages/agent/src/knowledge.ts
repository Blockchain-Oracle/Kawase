// arc_knowledge (A5): answers about Arc and Kawase from a curated local file (knowledge/arc-knowledge.json, built by
// `pnpm --filter @kawase/agent knowledge:build` from context/01-arc and Kawase's English docs), ranked with BM25 over
// each section's title and text. Local and free: no web call, no paid service, and every passage names its source.
import knowledge from "./knowledge/arc-knowledge.json" with { type: "json" };

export type KnowledgePassage = { title: string; source: string; text: string };
export type KnowledgeAnswer = { query: string; builtAt: string; passages: KnowledgePassage[] };

type Entry = { id: string; title: string; source: string; text: string };

/** BM25's usual constants: term-frequency saturation and length normalization. */
const K1 = 1.2;
const B = 0.75;
/** A title word counts like this many body words. */
const TITLE_WEIGHT = 3;
const TOP = 3;
const TERM_MIN = 2;
const HALF = 0.5;

const STOP = new Set(
  "the a an and or of to in on at for is are was be by it its this that with as from what how why when which who can do does i my me you your arc kawase".split(" "),
);

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= TERM_MIN && !STOP.has(word));

type Indexed = { entry: Entry; terms: Map<string, number>; length: number };

const entries = (knowledge as { builtAt: string; entries: Entry[] }).entries;
const indexed: Indexed[] = entries.map((entry) => {
  const terms = new Map<string, number>();
  for (const word of tokenize(entry.text)) terms.set(word, (terms.get(word) ?? 0) + 1);
  for (const word of tokenize(entry.title)) terms.set(word, (terms.get(word) ?? 0) + TITLE_WEIGHT);
  return { entry, terms, length: [...terms.values()].reduce((sum, count) => sum + count, 0) };
});
const averageLength = indexed.reduce((sum, item) => sum + item.length, 0) / Math.max(1, indexed.length);
const documentFrequency = new Map<string, number>();
for (const item of indexed) for (const term of item.terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);

const idf = (term: string) => {
  const containing = documentFrequency.get(term) ?? 0;
  return Math.log(1 + (indexed.length - containing + HALF) / (containing + HALF));
};

/** The passages that best answer the question, best first (none when nothing matches). */
export function searchKnowledge(query: string, top = TOP): KnowledgeAnswer {
  const words = [...new Set(tokenize(query))];
  const scored = indexed
    .map((item) => ({
      item,
      score: words.reduce((sum, word) => {
        const frequency = item.terms.get(word) ?? 0;
        if (frequency === 0) return sum;
        return sum + (idf(word) * frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * item.length) / averageLength));
      }, 0),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
  return {
    query,
    builtAt: (knowledge as { builtAt: string }).builtAt,
    passages: scored.map(({ item }) => ({ title: item.entry.title, source: item.entry.source, text: item.entry.text })),
  };
}
