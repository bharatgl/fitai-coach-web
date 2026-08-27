export type LiveHistorySource = {
  role: "user" | "assistant";
  content: string;
};

export type LiveHistoryTurn = {
  role: "user" | "model";
  text: string;
};

export function compactLiveHistory(
  newestFirst: LiveHistorySource[],
  characterBudget = 24_000,
): LiveHistoryTurn[] {
  let remainingCharacters = characterBudget;
  const selected: LiveHistoryTurn[] = [];
  for (const message of newestFirst) {
    if (remainingCharacters <= 0) break;
    const normalized = message.content.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const text = normalized.slice(0, Math.min(1_800, remainingCharacters));
    selected.push({ role: message.role === "assistant" ? "model" : "user", text });
    remainingCharacters -= text.length;
  }
  const chronological = selected.reverse();
  while (chronological[0]?.role === "model") chronological.shift();
  return chronological;
}
