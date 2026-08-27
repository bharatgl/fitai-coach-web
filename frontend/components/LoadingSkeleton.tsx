import { BrandLockup } from "@/components/BrandLockup";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <span className={`skeleton-block ${className}`.trim()} aria-hidden="true" />;
}

export function RouteSkeleton() {
  return (
    <main className="route-skeleton" aria-busy="true" aria-label="Loading forgefit.space">
      <header>
        <BrandLockup />
        <SkeletonLine className="skeleton-route-action" />
      </header>
      <section>
        <div>
          <SkeletonLine className="skeleton-kicker" />
          <SkeletonLine className="skeleton-title" />
          <SkeletonLine className="skeleton-title skeleton-title-short" />
          <SkeletonLine className="skeleton-copy" />
          <SkeletonLine className="skeleton-button" />
        </div>
        <SkeletonLine className="skeleton-preview" />
      </section>
      <span className="ui-visually-hidden" role="status">Loading forgefit.space…</span>
    </main>
  );
}

export function WorkspaceSkeleton() {
  return (
    <main className="workspace-skeleton" aria-busy="true" aria-label="Loading your training workspace">
      <aside>
        <BrandLockup />
        <div className="skeleton-nav">
          <SkeletonLine /><SkeletonLine /><SkeletonLine /><SkeletonLine />
        </div>
      </aside>
      <section>
        <div className="skeleton-topbar"><SkeletonLine /><SkeletonLine /></div>
        <div className="skeleton-workspace-content">
          <SkeletonLine className="skeleton-kicker" />
          <SkeletonLine className="skeleton-title" />
          <SkeletonLine className="skeleton-copy" />
          <SkeletonLine className="skeleton-dashboard-card" />
        </div>
      </section>
      <span className="ui-visually-hidden" role="status">Loading your training data…</span>
    </main>
  );
}

export function CoachSkeleton() {
  return (
    <div className="coach-skeleton" aria-hidden="true">
      <div className="coach-skeleton-message">
        <SkeletonLine className="skeleton-avatar" />
        <SkeletonLine className="skeleton-message skeleton-message-long" />
      </div>
      <div className="coach-skeleton-message coach-skeleton-message-mine">
        <SkeletonLine className="skeleton-message" />
        <SkeletonLine className="skeleton-avatar" />
      </div>
      <div className="coach-skeleton-message">
        <SkeletonLine className="skeleton-avatar" />
        <SkeletonLine className="skeleton-message skeleton-message-medium" />
      </div>
    </div>
  );
}

export function MovementTrackerSkeleton() {
  return (
    <section className="movement-skeleton" aria-busy="true" aria-label="Loading movement tracking">
      <div>
        <SkeletonLine className="skeleton-kicker" />
        <SkeletonLine className="skeleton-heading" />
        <SkeletonLine className="skeleton-copy" />
        <SkeletonLine className="skeleton-button" />
      </div>
      <SkeletonLine className="skeleton-camera" />
      <span className="ui-visually-hidden" role="status">Loading movement tracking…</span>
    </section>
  );
}
