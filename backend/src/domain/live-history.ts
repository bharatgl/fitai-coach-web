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

export function buildLiveCoachOpening(
  userName: string,
  date: Date,
  timeZone = defaultCoachTimeZone,
) {
  const firstName = userName.trim().split(/\s+/)[0] || "there";
  const hourPart = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  if (hour >= 5 && hour < 12) {
    return `Good morning, ${firstName}. How are you feeling, and what would be useful today?`;
  }
  if (hour >= 12 && hour < 17) {
    return `Good afternoon, ${firstName}. What would be useful right now?`;
  }
  if (hour >= 17 && hour < 22) {
    return `Good evening, ${firstName}. How has your day been, and what do you need from me?`;
  }
  return `Hey ${firstName}. How is your night going, and what do you need right now?`;
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
