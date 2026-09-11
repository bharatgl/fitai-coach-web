import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLocalRepositorySnapshot,
  localRepositoryContext,
} from "../src/services/local-repository.js";

test("builds a bounded source snapshot while excluding secrets and generated dependencies", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "forgefit-local-repo-"));
  try {
    await Promise.all([
      mkdir(path.join(root, "src"), { recursive: true }),
      mkdir(path.join(root, "node_modules", "ignored"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(root, "README.md"), "# Example project\nA useful product."),
      writeFile(path.join(root, "package.json"), JSON.stringify({ name: "example" })),
      writeFile(path.join(root, "src", "app.ts"), 'const apiKey = "super-secret-value";\nexport const feature = "live coaching";'),
      writeFile(path.join(root, "src", "billing-engine.ts"), "export const invoiceWorkflow = true;"),
      writeFile(path.join(root, ".env"), "API_KEY=must-not-be-read"),
      writeFile(path.join(root, "node_modules", "ignored", "index.js"), "throw new Error('ignore me')"),
    ]);

    const snapshot = await buildLocalRepositorySnapshot(root);
    const context = localRepositoryContext(snapshot);

    assert.equal(snapshot.name, path.basename(root));
    assert.match(context, /README\.md/);
    assert.match(context, /src\/app\.ts/);
    assert.match(context, /\[REDACTED\]/);
    assert.doesNotMatch(context, /super-secret-value|must-not-be-read|node_modules/);

    const targeted = await buildLocalRepositorySnapshot(root, "Explain the billing engine implementation");
    assert.equal(
      targeted.files.slice(0, 3).some((file) => file.path === "src/billing-engine.ts"),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
