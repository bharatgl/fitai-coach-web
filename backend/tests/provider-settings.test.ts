import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "../src/services/provider-settings.js";

test("provider API keys are encrypted with user and provider bound authenticated data", () => {
  const key = Buffer.alloc(32, 7);
  const plaintext = "super-secret-provider-key";
  const encrypted = encryptProviderSecret(plaintext, "user-1", "gemini", key);

  assert.notEqual(encrypted.ciphertext, plaintext);
  assert.equal(JSON.stringify(encrypted).includes(plaintext), false);
  assert.equal(decryptProviderSecret(encrypted, "user-1", "gemini", key), plaintext);
  assert.throws(() => decryptProviderSecret(encrypted, "user-2", "gemini", key));
  assert.throws(() => decryptProviderSecret(encrypted, "user-1", "elevenlabs", key));
});

test("generic AI credentials use a provider-neutral encryption scope", () => {
  const key = Buffer.alloc(32, 9);
  const encrypted = encryptProviderSecret("openai-or-claude-key", "user-1", "ai", key);

  assert.equal(decryptProviderSecret(encrypted, "user-1", "ai", key), "openai-or-claude-key");
  assert.throws(() => decryptProviderSecret(encrypted, "user-1", "gemini", key));
});
