import { createRequire } from "node:module";
import PDFDocument from "pdfkit";

const require = createRequire(import.meta.url);
const devanagariRegularFont = require.resolve(
  "@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
);
const devanagariBoldFont = require.resolve(
  "@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff",
);

const pdfRequestPattern = /\b(?:create|generate|make|export|download|save|prepare|turn|convert)\b.{0,80}\bpdf\b|\bpdf\b.{0,80}\b(?:create|generate|make|export|download|save|prepare|version|file|document)\b|\bpdf\b.{0,40}\b(?:bana|banao|banado|bana\s+do)\b|\b(?:bana|banao|banado|bana\s+do)\b.{0,40}\bpdf\b/i;

export function shouldGenerateCoachPdf(message: string) {
  return pdfRequestPattern.test(message);
}

function printableText(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...");
  return [...normalized]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("")
    .trim();
}

function plainInlineMarkdown(value: string) {
  return printableText(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function documentBlocks(content: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Array<
    | { kind: "heading"; text: string }
    | { kind: "paragraph"; text: string }
    | { kind: "bullet"; text: string }
    | { kind: "step"; number: string; text: string }
  > = [];
  let paragraph: string[] = [];

  const flush = () => {
    const text = plainInlineMarkdown(paragraph.join(" "));
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/) ?? line.match(/^\*\*([^*]+)\*\*:?$/);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: plainInlineMarkdown(heading[1]!) });
      continue;
    }
    const bullet = line.match(/^[-*\u2022]\s+(.+)$/);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: plainInlineMarkdown(bullet[1]!) });
      continue;
    }
    const step = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (step) {
      flush();
      blocks.push({ kind: "step", number: step[1]!, text: plainInlineMarkdown(step[2]!) });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

type TextWeight = "regular" | "bold";

function usesDevanagari(character: string) {
  const code = character.codePointAt(0) ?? 0;
  return (code >= 0x0900 && code <= 0x097f) || (code >= 0xa8e0 && code <= 0xa8ff);
}

function selectFont(doc: PDFKit.PDFDocument, devanagari: boolean, weight: TextWeight) {
  return doc.font(devanagari
    ? weight === "bold" ? "ForgeFitDevanagariBold" : "ForgeFitDevanagariRegular"
    : weight === "bold" ? "Helvetica-Bold" : "Helvetica");
}

function writeText(
  doc: PDFKit.PDFDocument,
  text: string,
  {
    x,
    y,
    weight = "regular",
    options = {},
  }: {
    x?: number;
    y?: number;
    weight?: TextWeight;
    options?: PDFKit.Mixins.TextOptions;
  } = {},
) {
  const runs: Array<{ devanagari: boolean; text: string }> = [];
  for (const character of text) {
    const devanagari = usesDevanagari(character);
    const previous = runs.at(-1);
    if (previous?.devanagari === devanagari) previous.text += character;
    else runs.push({ devanagari, text: character });
  }
  runs.forEach((run, index) => {
    selectFont(doc, run.devanagari, weight);
    const runOptions = { ...options, continued: index < runs.length - 1 };
    if (index === 0 && x !== undefined) doc.text(run.text, x, y ?? doc.y, runOptions);
    else doc.text(run.text, runOptions);
  });
  return doc;
}

function drawPageFooter(doc: PDFKit.PDFDocument, pageNumber: number, pageCount: number) {
  const bottom = doc.page.height - 34;
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  doc.moveTo(54, bottom - 10).lineTo(doc.page.width - 54, bottom - 10).lineWidth(0.5).strokeColor("#d8dfd2").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#687267");
  doc.text("forgefit.space - fitness guidance, not medical care", 54, bottom, {
    lineBreak: false,
  });
  doc.text(`${pageNumber} / ${pageCount}`, doc.page.width - 100, bottom, {
    width: 46,
    align: "right",
    lineBreak: false,
  });
  doc.restore();
  doc.page.margins.bottom = originalBottomMargin;
}

function paintPageBackground(doc: PDFKit.PDFDocument) {
  doc.save().rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff").restore();
}

export async function generateCoachPdf({
  title,
  content,
  generatedAt = new Date(),
}: {
  title: string;
  content: string;
  generatedAt?: Date;
}) {
  const safeTitle = printableText(title) || "ForgeFit Coach Document";
  const safeContent = printableText(content);
  if (!safeContent) throw new Error("PDF content cannot be empty.");

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, right: 54, bottom: 58, left: 54 },
    bufferPages: true,
    info: {
      Title: safeTitle,
      Author: "forgefit.space",
      Creator: "ForgeFit Coach",
      CreationDate: generatedAt,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  paintPageBackground(doc);
  doc.on("pageAdded", () => paintPageBackground(doc));
  doc.registerFont("ForgeFitDevanagariRegular", devanagariRegularFont);
  doc.registerFont("ForgeFitDevanagariBold", devanagariBoldFont);

  doc.roundedRect(54, 46, 30, 30, 7).fill("#baff3c");
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#07111b").text("F", 64, 53, {
    lineBreak: false,
  });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#07111b").text("FORGEFIT.SPACE", 94, 55, {
    characterSpacing: 1.2,
    lineBreak: false,
  });
  doc.moveTo(54, 88).lineTo(doc.page.width - 54, 88).lineWidth(2).strokeColor("#baff3c").stroke();
  doc.x = 54;
  doc.y = 112;
  doc.fontSize(24).fillColor("#07111b");
  writeText(doc, safeTitle, {
    x: 54,
    y: 112,
    weight: "bold",
    options: { width: doc.page.width - 108, lineGap: 4 },
  });
  doc.moveDown(0.45);
  doc.font("Helvetica").fontSize(9).fillColor("#687267").text(
    `Prepared ${new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(generatedAt)}`,
    54,
    doc.y,
    { width: doc.page.width - 108 },
  );
  doc.moveDown(1.5);

  for (const block of documentBlocks(safeContent)) {
    doc.x = 54;
    if (block.kind === "heading") {
      selectFont(doc, [...block.text].some(usesDevanagari), "bold").fontSize(15);
      const headingHeight = doc.heightOfString(block.text, {
        width: doc.page.width - 108,
        lineGap: 3,
      });
      if (doc.y + headingHeight + 42 > doc.page.height - 58) doc.addPage();
      doc.moveDown(0.5);
      doc.x = 54;
      doc.fillColor("#10221c");
      writeText(doc, block.text, {
        weight: "bold",
        options: { width: doc.page.width - 108, lineGap: 3 },
      });
      doc.moveDown(0.35);
      continue;
    }
    if (block.kind === "bullet" || block.kind === "step") {
      const marker = block.kind === "bullet" ? "-" : `${block.number}.`;
      const markerWidth = block.kind === "bullet" ? 14 : 22;
      const startY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#67a611").text(marker, 58, startY, {
        width: markerWidth,
        lineBreak: false,
      });
      doc.fontSize(10.5).fillColor("#25332e");
      writeText(doc, block.text, {
        x: 58 + markerWidth,
        y: startY,
        options: { width: doc.page.width - 116 - markerWidth, lineGap: 3 },
      });
      doc.moveDown(0.45);
      doc.x = 54;
      continue;
    }
    doc.fontSize(10.5).fillColor("#25332e");
    writeText(doc, block.text, {
      options: { align: "left", lineGap: 3.2 },
    });
    doc.moveDown(0.75);
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    drawPageFooter(doc, index + 1, range.count);
  }
  doc.end();
  return completed;
}
