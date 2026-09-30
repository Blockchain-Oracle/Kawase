// Exact-amount tests: parsing what people type in each locale, formatting, and the two USDC decimal views.
import assert from "node:assert/strict";
import { test } from "node:test";

import { AmountParseError, add, amount, canonicalAmount, compare, formatAmount, parseAmount, rescale, subtract } from "../src/index";

const usdc = (baseUnits: bigint) => amount("USDC", baseUnits);

test("parses plain and grouped amounts exactly", () => {
  assert.equal(parseAmount("25", "USDC", "en").baseUnits, 25_000_000n);
  assert.equal(parseAmount("1,240.50", "USDC", "en").baseUnits, 1_240_500_000n);
  assert.equal(parseAmount(" 0.000001 ", "USDC", "en").baseUnits, 1n);
  assert.equal(parseAmount("1_000", "USDC", "en").baseUnits, 1_000_000_000n);
});

test("parses the decimal comma of European locales", () => {
  assert.equal(parseAmount("1.240,50", "USDC", "de").baseUnits, 1_240_500_000n);
  assert.equal(parseAmount("1 240,5", "EURC", "fr").baseUnits, 1_240_500_000n);
});

test("parses Arabic, Persian, Hindi and Bengali digits", () => {
  assert.equal(parseAmount("٢٥", "USDC", "ar").baseUnits, 25_000_000n);
  assert.equal(parseAmount("١٬٢٤٠٫٥٠", "USDC", "ar").baseUnits, 1_240_500_000n);
  assert.equal(parseAmount("۲۵", "USDC", "fa").baseUnits, 25_000_000n);
  assert.equal(parseAmount("२५", "USDC", "hi").baseUnits, 25_000_000n);
  assert.equal(parseAmount("২৫", "USDC", "bn").baseUnits, 25_000_000n);
});

test("keeps very large amounts exact", () => {
  assert.equal(parseAmount("9007199254740993.000001", "USDC", "en").baseUnits, 9_007_199_254_740_993_000_001n);
});

test("refuses input it cannot read exactly", () => {
  const reason = (input: string) => {
    try {
      parseAmount(input, "USDC", "en");
    } catch (error) {
      assert.ok(error instanceof AmountParseError);
      return error.reason;
    }
    return "accepted";
  };
  assert.equal(reason(""), "empty");
  assert.equal(reason("-5"), "negative");
  assert.equal(reason("abc"), "invalid");
  assert.equal(reason("1.2.3"), "invalid");
  assert.equal(reason("0.0000001"), "too_many_decimals");
});

test("formats for the locale and appends the symbol", () => {
  assert.equal(formatAmount(usdc(1_240_500_000n), "en"), "1,240.50 USDC");
  assert.equal(formatAmount(usdc(1_240_500_000n), "de"), "1.240,50 USDC");
  assert.equal(formatAmount(usdc(25_000_000n), "en", { withSymbol: false }), "25.00");
  assert.equal(formatAmount(usdc(-1_500_000n), "en"), "-1.50 USDC");
});

test("formatting truncates and never rounds up", () => {
  assert.equal(formatAmount(usdc(1_999_999n), "en"), "1.99 USDC");
  assert.equal(formatAmount(usdc(9_007_199_254_740_993_000_001n), "en"), "9,007,199,254,740,993.00 USDC");
});

test("the canonical form is locale-independent and drops trailing zeros", () => {
  assert.equal(canonicalAmount(usdc(25_000_000n)), "25 USDC");
  assert.equal(canonicalAmount(usdc(25_002_100n)), "25.0021 USDC");
  assert.equal(canonicalAmount(amount("EURC", 1n)), "0.000001 EURC");
});

test("a parsed amount formats back to what was typed", () => {
  for (const typed of ["0.01", "25.00", "1,240.50", "999,999.99"]) {
    assert.equal(formatAmount(parseAmount(typed, "USDC", "en"), "en", { withSymbol: false }), typed);
  }
});

test("rescale converts between the 18-decimal native view and the 6-decimal token view", () => {
  assert.equal(rescale(1_000_000n, 6, 18), 1_000_000_000_000_000_000n);
  assert.equal(rescale(1_000_000_000_000_000_000n, 18, 6), 1_000_000n);
  assert.equal(rescale(1_999_999_999_999n, 18, 6), 1n);
  assert.equal(rescale(5n, 6, 6), 5n);
});

test("arithmetic stays within one asset", () => {
  assert.equal(add(usdc(1n), usdc(2n)).baseUnits, 3n);
  assert.equal(subtract(usdc(1n), usdc(2n)).baseUnits, -1n);
  assert.equal(compare(usdc(1n), usdc(2n)), -1);
  assert.equal(compare(usdc(2n), usdc(2n)), 0);
  assert.throws(() => add(usdc(1n) as never, amount("EURC", 1n) as never), /Cannot combine/);
});

test("the canonical form handles negative amounts", () => {
  assert.equal(canonicalAmount(usdc(-1_500_000n)), "-1.5 USDC");
  assert.equal(canonicalAmount(usdc(-500_000n)), "-0.5 USDC");
});
