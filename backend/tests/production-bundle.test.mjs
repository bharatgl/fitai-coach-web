import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("keeps the Google Gen AI SDK external to the ESM production bundle", async () => {
  const bundle = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");

  assert.match(bundle, /from ["']@google\/genai["']/);
  assert.doesNotMatch(bundle, /Dynamic require of/);
  assert.doesNotMatch(bundle, /google-auth-library\/build\/src/);
});
