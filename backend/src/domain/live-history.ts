export type LiveHistorySource = {
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
};

export type LiveHistoryTurn = {
  role: "user" | "model";
  text: string;
};

export const defaultCoachTimeZone = "Asia/Kolkata";

export function formatCoachLocalDateTime(
  date: Date,
  timeZone = defaultCoachTimeZone,
) {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    dateStyle: "full",
    timeStyle: "long",
    hour12: true,
  }).format(date);
  return `${formatted} (${timeZone})`;
}

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

export function compactDatedLiveHistory(
  newestFirst: LiveHistorySource[],
  characterBudget = 24_000,
  timeZone = defaultCoachTimeZone,
): LiveHistoryTurn[] {
  let remainingCharacters = characterBudget;
  const selected: LiveHistoryTurn[] = [];
  for (const message of newestFirst) {
    if (remainingCharacters <= 0) break;
    const normalized = message.content.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const timestamp = message.createdAt
      ? `[Sent ${formatCoachLocalDateTime(message.createdAt, timeZone)}] `
      : "";
    const text = `${timestamp}${normalized}`.slice(
      0,
      Math.min(1_800, remainingCharacters),
    );
    selected.push({ role: message.role === "assistant" ? "model" : "user", text });
    remainingCharacters -= text.length;
  }
  const chronological = selected.reverse();
  while (chronological[0]?.role === "model") chronological.shift();
  return chronological;
}
