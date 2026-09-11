import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses the bounded tsx watcher instead of Node's EMFILE-prone watch mode", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts.dev, /^tsx watch /);
  assert.match(packageJson.scripts.dev, /--env-file-if-exists=\.env/);
  assert.doesNotMatch(packageJson.scripts.dev, /node --watch/);
});
