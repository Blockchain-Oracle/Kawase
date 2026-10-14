// Turns a formatted money string back into what NumberFlow wants (prefix, number, suffix, decimals), for the web twins of
// the odometer: the phone's Skia odometer draws the text it is given, the web rolls a number. The text is the kit's own
// "1,234.56" / "$1,234.56" / "-0.5 USDC" shape (grouping commas, a decimal point); anything else is left whole as the
// prefix so it still reads correctly, just without rolling.

export type ParsedFigure = { prefix: string; value: number; suffix: string; decimals: number; grouping: boolean };

const SHAPE = /^([^0-9-]*)(-?)([0-9][0-9,]*)(?:\.([0-9]+))?(.*)$/;

export function parseFigure(text: string): ParsedFigure | null {
  const match = SHAPE.exec(text);
  if (!match) return null;
  const [, prefix = "", sign = "", whole = "", frac = "", suffix = ""] = match;
  const digits = whole.replace(/,/g, "");
  const value = Number(`${sign}${digits}${frac ? `.${frac}` : ""}`);
  if (!Number.isFinite(value)) return null;
  return { prefix, value, suffix, decimals: frac.length, grouping: whole.includes(",") };
}
