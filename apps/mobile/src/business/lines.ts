// Pasted payee lines (a CSV export or typed by hand): one per line, "who, amount" — who is a contact's name, an @handle
// or an address; the amount is the last field. A header row and blank lines are skipped.
export type PastedLine = { recipient: string; amount: string };

const AMOUNT = /^\d+(?:[.,]\d+)?$/;

export function parseLines(text: string): { lines: PastedLine[]; bad: number[] } {
  const lines: PastedLine[] = [];
  const bad: number[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const row = raw.trim();
    if (!row) return;
    const cut = Math.max(row.lastIndexOf(","), row.lastIndexOf(";"), row.lastIndexOf("\t"));
    const recipient = (cut > 0 ? row.slice(0, cut) : "").trim().replace(/^"|"$/g, "");
    const amount = (cut > 0 ? row.slice(cut + 1) : row).trim().replace(/^"|"$/g, "").replace(",", ".");
    if (!recipient || !AMOUNT.test(amount)) {
      // A first row that is a header ("name,amount") is not a mistake.
      if (lines.length > 0 || bad.length > 0 || !/[a-z]/i.test(amount)) bad.push(index + 1);
      return;
    }
    lines.push({ recipient, amount });
  });
  return { lines, bad };
}
