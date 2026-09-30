import assert from "node:assert/strict";
import { test } from "node:test";

import { CATALOGS, isRtlLocale } from "../src/index";

function keysOf(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key));
}

test("every catalog has exactly the English keys, none empty", () => {
  const expected = keysOf(CATALOGS.en).sort();
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    assert.deepEqual(keysOf(catalog).sort(), expected, `keys of ${locale}`);
    for (const key of expected) {
      const text = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog);
      assert.ok(typeof text === "string" && text.trim().length > 0, `${locale}: ${key}`);
    }
  }
});

test("placeholders match the English ones", () => {
  const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
  for (const key of keysOf(CATALOGS.en)) {
    const english = key
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], CATALOGS.en) as string;
    for (const [locale, catalog] of Object.entries(CATALOGS)) {
      const text = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], catalog) as string;
      assert.deepEqual(placeholders(text), placeholders(english), `${locale}: ${key}`);
    }
  }
});

test("Arabic and Urdu are right-to-left", () => {
  assert.equal(isRtlLocale("ar"), true);
  assert.equal(isRtlLocale("ur-PK"), true);
  assert.equal(isRtlLocale("en"), false);
});
