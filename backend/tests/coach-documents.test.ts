import assert from "node:assert/strict";
import test from "node:test";
import {
  generateCoachPdf,
  shouldGenerateCoachPdf,
} from "../src/domain/coach-documents.js";

test("recognizes explicit PDF generation requests without matching ordinary PDF review", () => {
  assert.equal(shouldGenerateCoachPdf("Generate a PDF of this plan"), true);
  assert.equal(shouldGenerateCoachPdf("Can you make this into a downloadable pdf file?"), true);
  assert.equal(shouldGenerateCoachPdf("PDF bana do"), true);
  assert.equal(shouldGenerateCoachPdf("Review the PDF I uploaded"), false);
});

test("renders a branded multi-section coach PDF", async () => {
  const pdf = await generateCoachPdf({
    title: "12-Week Training Plan",
    content: [
      "## Goal",
      "Build strength while keeping recovery sustainable.",
      "## Weekly actions",
      "- Train four times per week",
      "- Keep two repetitions in reserve",
      "1. Review progress every Sunday",
    ].join("\n"),
    generatedAt: new Date("2026-08-30T00:00:00.000Z"),
  });

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 1_500);
  assert.equal(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length, 1);
});

test("embeds a Devanagari font for Hindi and Hinglish documents", async () => {
  const pdf = await generateCoachPdf({
    title: "आज का ForgeFit plan",
    content: "## लक्ष्य / Goal\nचार strength sessions पूरे करें और recovery steady रखें।",
  });

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 4_000);
});
