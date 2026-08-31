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

const solutions = [
  { icon: "ϟ", name: "ForgeFit Coach", label: "Live now", copy: "Adaptive training, recovery context, movement guidance, and a coach that remembers your plan.", href: "/signin" },
  { icon: "◎", name: "Interview Coach", label: "Build in Studio", copy: "Role-specific mock interviews, useful follow-ups, and candid feedback on every answer.", href: "/signin?callbackUrl=/studio" },
  { icon: "▤", name: "Resume Reviewer", label: "Build in Studio", copy: "Practical resume review for a target role, with honest edits that never invent your experience.", href: "/signin?callbackUrl=/studio" },
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
          <a href="#solutions">Solutions</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/studio">Forge Studio</Link>
          <Link href="/exercises">Exercises</Link>
          <a href="#privacy">Privacy</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signIn} href="/signin">Sign in</Link>
          <Link className={styles.headerCta} href="/signin?callbackUrl=/studio">Build a specialist <Arrow /></Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true">✦</span> Personal AI, with a clear job</p>
          <h1 id="landing-heading">One space.<br /><em>Your specialists.</em></h1>
          <p className={styles.heroText}>
            Focused AI guides for fitness, interviews, resumes, and the goals you choose to build next.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/signin?callbackUrl=/studio">Build my specialist <Arrow /></Link>
            <a className={styles.secondaryCta} href="#solutions">Explore solutions <span aria-hidden="true">↓</span></a>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className={styles.solutions} id="solutions" aria-labelledby="solutions-heading">
        <header className={styles.featuresHeader}>
          <div>
            <p className={styles.sectionEyebrow}>The specialist network</p>
            <h2 id="solutions-heading">Different goals.<br /><em>Different experts.</em></h2>
          </div>
          <p>Each bot has a deliberately narrow role, its own context, and explicit boundaries. Your fitness coach stays focused on fitness.</p>
        </header>
        <div className={styles.solutionGrid}>
          {solutions.map((solution) => (
            <article key={solution.name}>
              <div><i>{solution.icon}</i><span>{solution.label}</span></div>
              <h3>{solution.name}</h3>
              <p>{solution.copy}</p>
              <Link href={solution.href}>Open solution <Arrow /></Link>
            </article>
          ))}
          <article className={styles.studioCard}>
            <div><i>✦</i><span>Bot builder</span></div>
            <h3>Forge Studio</h3>
            <p>Create a specialist with its own identity, goal, boundaries, conversation starters, and natural voice.</p>
            <Link href="/signin?callbackUrl=/studio">Create a bot <Arrow /></Link>
          </article>
        </div>
      </section>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.sectionEyebrow}>How it works</p>
            <h2 id="how-heading">Focused help.<br /><em>No identity crisis.</em></h2>
          </div>
        </div>
        <div className={styles.steps}>
          <article><span>01</span><h3>Choose the right specialist</h3></article>
          <article><span>02</span><h3>Share only relevant context</h3></article>
          <article><span>03</span><h3>Practice, improve, repeat</h3></article>
        </div>
      </section>

      <section className={styles.features} id="features" aria-labelledby="features-heading">
        <header className={styles.featuresHeader}>
          <div>
            <p className={styles.sectionEyebrow}>The system</p>
          <h2 id="features-heading">ForgeFit Coach.<br /><em>Fitness, deeply.</em></h2>
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
          <h2 id="privacy-heading">Your context.<br /><em>Your control.</em></h2>
          <p>Movement tracking stays on your device. Voice recording is disabled for Studio bots.</p>
        </div>
        <div className={styles.finalCta}>
          <Link className={styles.lightCta} href="/signin?callbackUrl=/studio">Build a specialist <Arrow /></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <BrandLockup />
        <div><a href="#solutions">Solutions</a><a href="#how-it-works">How it works</a><Link href="/studio">Forge Studio</Link><Link href="/exercises">Exercises</Link><a href="#privacy">Privacy</a><Link href="/signin">Sign in</Link></div>
        <small>© {new Date().getFullYear()} forgefit.space · Personal specialist tools. ForgeFit Coach provides fitness guidance, not medical care. Exercise data by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>.</small>
      </footer>
    </main>
  );
}
