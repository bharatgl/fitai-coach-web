import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { generateStructuredAI } from "../src/provider.js";

const resultSchema = z.object({ answer: z.string() });
const pdfBase64 = Buffer.from("%PDF-1.7 test document", "utf8").toString("base64");

test("maps files and structured output through the OpenAI Responses adapter", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ output_text: "{\"answer\":\"reviewed\"}" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await generateStructuredAI({
      provider: { kind: "openai", apiKey: "test-key", model: "gpt-test" },
      schema: resultSchema,
      systemInstruction: "Review the file.",
      contents: [{
        role: "user",
        parts: [
          { file: { name: "report.pdf", mimeType: "application/pdf", dataBase64: pdfBase64 } },
          { text: "Summarize it." },
        ],
      }],
      maxOutputTokens: 300,
    });

    assert.deepEqual(result, { answer: "reviewed" });
    assert.equal(requestUrl, "https://api.openai.com/v1/responses");
    const input = requestBody.input as Array<{ content: Array<Record<string, unknown>> }>;
    assert.deepEqual(input[0]?.content[0], {
      type: "input_file",
      filename: "report.pdf",
      file_data: `data:application/pdf;base64,${pdfBase64}`,
    });
    assert.equal((requestBody.text as { format: { type: string } }).format.type, "json_schema");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps PDFs through the Anthropic document adapter", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      content: [{ type: "text", text: "{\"answer\":\"reviewed\"}" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await generateStructuredAI({
      provider: { kind: "anthropic", apiKey: "test-key", model: "claude-test" },
      schema: resultSchema,
      systemInstruction: "Review the file.",
      contents: [{
        role: "user",
        parts: [{ file: { name: "report.pdf", mimeType: "application/pdf", dataBase64: pdfBase64 } }],
      }],
      maxOutputTokens: 300,
    });

    assert.deepEqual(result, { answer: "reviewed" });
    assert.equal(requestUrl, "https://api.anthropic.com/v1/messages");
    const messages = requestBody.messages as Array<{ content: Array<Record<string, unknown>> }>;
    assert.deepEqual(messages[0]?.content[0], {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
      title: "report.pdf",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses a configurable Responses endpoint for OpenAI-compatible providers", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify({ output_text: "{\"answer\":\"local\"}" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await generateStructuredAI({
      provider: {
        kind: "openai_compatible",
        apiKey: "local-key",
        model: "local-model",
        baseUrl: "http://127.0.0.1:8080/v1/",
      },
      schema: resultSchema,
      systemInstruction: "Answer.",
      contents: "Hello",
      maxOutputTokens: 100,
    });

    assert.deepEqual(result, { answer: "local" });
    assert.equal(requestUrl, "http://127.0.0.1:8080/v1/responses");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
