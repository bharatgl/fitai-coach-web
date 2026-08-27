import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import styles from "./LandingPage.module.css";

const features = [
  {
    number: "01",
    kind: "plan",
    title: "Adaptive plans",
  },
  {
    number: "02",
    kind: "coach",
    title: "One coach",
  },
  {
    number: "03",
    kind: "track",
    title: "Private tracking",
  },
  {
    number: "04",
    kind: "history",
    title: "Useful history",
  },
] as const;

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function ProductPreview() {
  return (
    <div className={styles.productStage} aria-label="Preview of the forgefit.space training workspace">
      <div className={styles.stageGlow} aria-hidden="true" />
      <div className={styles.stageSculpture} aria-hidden="true">
        <span className={styles.sculptureCore} />
        <span className={`${styles.sculptureRing} ${styles.ringOne}`} />
        <span className={`${styles.sculptureRing} ${styles.ringTwo}`} />
        <span className={`${styles.sculptureRing} ${styles.ringThree}`} />
        <i className={`${styles.sculptureSatellite} ${styles.satelliteOne}`} />
        <i className={`${styles.sculptureSatellite} ${styles.satelliteTwo}`} />
      </div>
      <div className={styles.orbitOne} aria-hidden="true" />
      <div className={styles.orbitTwo} aria-hidden="true" />
      <article className={styles.dashboardCard}>
        <header className={styles.dashboardHeader}>
          <BrandLockup />
          <span className={styles.systemStatus}><i /> System online</span>
          <span className={styles.avatar}>BG</span>
        </header>
        <div className={styles.dashboardGrid}>
          <nav className={styles.previewNav} aria-label="Product preview navigation">
            <span className={styles.previewNavLabel}>Workspace</span>
            <span className={styles.previewNavItem}>Today</span>
            <span className={`${styles.previewNavItem} ${styles.active}`}>Plan</span>
            <span className={styles.previewNavItem}>Coach</span>
            <span className={styles.previewNavItem}>History</span>
          </nav>
          <section className={styles.previewMain}>
            <div className={styles.previewHeading}>
              <div>
                <span className={styles.tinyLabel}>TODAY · ADAPTIVE PLAN</span>
                <h2>Ready to build?</h2>
                <p>Your next session reflects your schedule and recovery.</p>
              </div>
              <span className={styles.readiness}><strong>82</strong><small>ready</small></span>
            </div>
            <div className={styles.metricRow} aria-label="Training plan metrics">
              <span><small>Week</small><strong>02 / 04</strong></span>
              <span><small>Sessions</small><strong>3 planned</strong></span>
              <span><small>Focus</small><strong>Strength</strong></span>
            </div>
            <article className={styles.workoutCard}>
              <div className={styles.workoutIndex}>01</div>
              <div>
                <span className={styles.tinyLabel}>TODAY&apos;S SESSION · 42 MIN</span>
                <h3>Full-body foundation</h3>
                <p>6 movements · 18 working sets · Moderate</p>
              </div>
              <span className={styles.play} aria-hidden="true">→</span>
            </article>
            <div className={styles.coachNote}>
              <span className={styles.coachSpark} aria-hidden="true">✦</span>
              <p><strong>Coach intelligence</strong> Your recovery is on track. Keep two reps in reserve and own every position today.</p>
            </div>
          </section>
        </div>
      </article>
      <aside className={styles.trackingToast}>
        <span className={styles.trackingIcon} aria-hidden="true">◎</span>
        <div><strong>On-device tracking</strong><small>Camera frames stay in your browser</small></div>
      </aside>
      <aside className={styles.planToast}>
        <span className={styles.toastDot} aria-hidden="true" />
        <div><strong>Plan updated</strong><small>Schedule change applied</small></div>
      </aside>
    </div>
  );
}

function FeatureVisual({ kind }: { kind: (typeof features)[number]["kind"] }) {
  if (kind === "plan") {
    return (
      <div className={`${styles.featureVisual} ${styles.planVisual}`} aria-hidden="true">
        <span><i>MON</i><b /></span><span><i>WED</i><b /></span><span><i>FRI</i><b /></span>
      </div>
    );
  }
  if (kind === "coach") {
    return (
      <div className={`${styles.featureVisual} ${styles.coachVisual}`} aria-hidden="true">
        <p>Can we adjust for recovery?</p>
        <p>Yes—lower load, same pattern.</p>
      </div>
    );
  }
  if (kind === "track") {
    return (
      <div className={`${styles.featureVisual} ${styles.trackVisual}`} aria-hidden="true">
        <span className={styles.bodyHead} /><span className={styles.bodyTorso} />
        <span className={styles.bodyArmLeft} /><span className={styles.bodyArmRight} />
        <span className={styles.bodyLegLeft} /><span className={styles.bodyLegRight} />
        <i className={styles.jointOne} /><i className={styles.jointTwo} /><i className={styles.jointThree} />
        <b>REP 08</b>
      </div>
    );
  }
  return (
    <div className={`${styles.featureVisual} ${styles.historyVisual}`} aria-hidden="true">
      <span style={{ "--bar": "48%" } as React.CSSProperties}><i>W1</i><b /></span>
      <span style={{ "--bar": "66%" } as React.CSSProperties}><i>W2</i><b /></span>
      <span style={{ "--bar": "78%" } as React.CSSProperties}><i>W3</i><b /></span>
      <span style={{ "--bar": "92%" } as React.CSSProperties}><i>W4</i><b /></span>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <Link className={styles.brandLink} href="/" aria-label="forgefit.space home">
          <BrandLockup />
        </Link>
        <nav className={styles.nav} aria-label="Landing page navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Product</a>
          <Link href="/exercises">Exercises</Link>
          <a href="#privacy">Privacy</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signIn} href="/signin">Sign in</Link>
          <Link className={styles.headerCta} href="/signin">Start training <Arrow /></Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true">✦</span> Built around you</p>
          <h1 id="landing-heading">Build strength.<br /><em>Stay on track.</em></h1>
          <p className={styles.heroText}>
            One focused training system. One clear next move.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/signin">Build my plan <Arrow /></Link>
            <a className={styles.secondaryCta} href="#how-it-works">Explore the system <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.sectionEyebrow}>How it works</p>
            <h2 id="how-heading">Three steps. <em>One plan.</em></h2>
          </div>
        </div>
        <div className={styles.steps}>
          <article><span>01</span><h3>Share context</h3></article>
          <article><span>02</span><h3>Follow the plan</h3></article>
          <article><span>03</span><h3>Log and adapt</h3></article>
        </div>
      </section>

      <section className={styles.features} id="features" aria-labelledby="features-heading">
        <header className={styles.featuresHeader}>
          <div>
            <p className={styles.sectionEyebrow}>The system</p>
            <h2 id="features-heading">Everything <em>connected.</em></h2>
          </div>
        </header>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article className={styles.featureCard} key={feature.number}>
              <div className={styles.featureTop}><span>{feature.number}</span></div>
              <FeatureVisual kind={feature.kind} />
              <h3>{feature.title}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.privacy} id="privacy" aria-labelledby="privacy-heading">
        <div className={styles.privacyMark} aria-hidden="true"><span /><b /><i /></div>
        <div className={styles.privacyCopy}>
          <p className={styles.sectionEyebrow}>Private by design</p>
          <h2 id="privacy-heading">Your workout.<br /><em>Your data.</em></h2>
          <p>Movement tracking stays on your device.</p>
        </div>
        <div className={styles.finalCta}>
          <Link className={styles.lightCta} href="/signin">Build my plan <Arrow /></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <BrandLockup />
        <div><a href="#how-it-works">How it works</a><a href="#features">Product</a><Link href="/exercises">Exercises</Link><a href="#privacy">Privacy</a><Link href="/signin">Sign in</Link></div>
        <small>© {new Date().getFullYear()} forgefit.space · Fitness guidance, not medical care. Exercise data by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>.</small>
      </footer>
    </main>
  );
}
