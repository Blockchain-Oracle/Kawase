import assert from "node:assert/strict";
import { test } from "node:test";

import { hasUncasedScript } from "../src/index";

test("Latin, Cyrillic and Greek text can be letter-spaced", () => {
  for (const text of ["Listening", "Слушаю", "Ακούω", "Écoute…", "25 USDC"])
    assert.equal(hasUncasedScript(text), false, text);
});

test("Arabic, Urdu, Hindi, Bengali, Chinese and Japanese text is never letter-spaced", () => {
  for (const text of ["أستمع", "سن رہا ہوں", "सुन रहा हूँ", "শুনছি", "正在聆听", "きいています", "Kawase 為替"]) {
    assert.equal(hasUncasedScript(text), true, text);
  }
});
