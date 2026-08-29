import type { CoachThread } from "@fitai/contracts";

function activityTime(thread: CoachThread) {
  const parsed = Date.parse(thread.lastMessageAt ?? thread.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mostRecentActiveCoachThread(
  threads: CoachThread[],
  scope: CoachThread["scope"],
) {
  return threads
    .filter((thread) => !thread.archived && thread.scope === scope)
    .reduce<CoachThread | undefined>((latest, thread) => (
      !latest || activityTime(thread) > activityTime(latest) ? thread : latest
    ), undefined);
}
