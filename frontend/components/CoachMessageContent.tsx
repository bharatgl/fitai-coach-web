import { Fragment, type ReactNode } from "react";

export type CoachMessageBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] };

export function parseCoachMessage(content: string): CoachMessageBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: CoachMessageBlock[] = [];
  let paragraph: string[] = [];

  function flushParagraph() {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  }

  for (let index = 0; index < lines.length;) {
    const line = lines[index]!.trim();
    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/)
      ?? line.match(/^\*\*([^*]+)\*\*:?$/);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", text: heading[1]!.trim() });
      index += 1;
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^[-*•]\s+/.test(lines[index]!.trim())) {
        items.push(lines[index]!.trim().replace(/^[-*•]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ kind: "bullets", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index]!.trim())) {
        items.push(lines[index]!.trim().replace(/^\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push({ kind: "steps", items });
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

function inlineContent(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>,
  );
}

export function CoachMessageContent({ content }: { content: string }) {
  return (
    <div className="coach-message-content">
      {parseCoachMessage(content).map((block, index) => {
        if (block.kind === "heading") {
          const isEvidence = block.text.toLowerCase() === "personalized from your data";
          return <h3 className={isEvidence ? "coach-evidence-heading" : undefined} key={index}>{inlineContent(block.text)}</h3>;
        }
        if (block.kind === "bullets") {
          return <ul key={index}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{inlineContent(item)}</li>)}</ul>;
        }
        if (block.kind === "steps") {
          return <ol key={index}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{inlineContent(item)}</li>)}</ol>;
        }
        return <p key={index}>{inlineContent(block.text)}</p>;
      })}
    </div>
  );
}
