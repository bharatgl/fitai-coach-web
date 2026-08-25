import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import styles from "./LandingPage.module.css";

const features = [
  {
    number: "01",
    kind: "plan",
    eyebrow: "Adaptive programming",
    title: "A plan built around real life",
    copy: "Your goal, schedule, experience, equipment, and recovery shape a four-week plan that progresses without pretending every week is perfect.",
  },
  {
    number: "02",
    kind: "coach",
    eyebrow: "Account-aware coaching",
    title: "Context that stays in the conversation",
    copy: "Ask about today’s session, share an image or PDF, adjust your plan, and keep separate training conversations organized in one place.",
  },
  {
    number: "03",
    kind: "track",
    eyebrow: "Private movement intelligence",
    title: "Live guidance, processed on device",
    copy: "For supported movements, camera-based rep tracking runs in your browser. Only compact workout summaries reach forgefit.space.",
  },
  {
    number: "04",
    kind: "history",
    eyebrow: "Workout execution",
    title: "Every set becomes useful history",
    copy: "Log sets, substitutions, effort, and reflections. Your completed work becomes the signal for smarter recommendations next time.",
  },
] as const;

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function ProductPreview() {
  return (
    <div className={styles.productStage} aria-label="Preview of the forgefit.space training workspace">
      <div className={styles.stageGlow} aria-hidden="true" />
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
        <p>Can we adjust today around my recovery?</p>
        <p>Yes. We’ll keep the pattern, lower the load, and protect the habit.</p>
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
          <a href="#privacy">Privacy</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signIn} href="/signin">Sign in</Link>
          <Link className={styles.headerCta} href="/signin">Start training <Arrow /></Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-heading">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true">✦</span> Adaptive training intelligence</p>
          <h1 id="landing-heading">Build strength.<br />Track everything.<br /><em>Adapt as you go.</em></h1>
          <p className={styles.heroText}>
            Account-aware coaching, practical programming, private movement guidance, and progress that compounds—inside one focused training system.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/signin">Build my plan <Arrow /></Link>
            <a className={styles.secondaryCta} href="#how-it-works">Explore the system <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.promiseRow} aria-label="Product highlights">
            <span><i aria-hidden="true" /> Personalized programming</span>
            <span><i aria-hidden="true" /> Private by design</span>
            <span><i aria-hidden="true" /> Built for real schedules</span>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className={styles.valueStrip} aria-label="forgefit.space capabilities">
        <p>One performance system</p>
        <div><span>Adaptive plans</span><i>•</i><span>AI coach</span><i>•</i><span>Live movement</span><i>•</i><span>Workout history</span></div>
      </section>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.sectionEyebrow}>How forgefit.space works</p>
            <h2 id="how-heading">Your context in.<br /><em>A clear plan out.</em></h2>
          </div>
          <p>Training should respond to the person doing it. forgefit.space turns the reality of your week into specific, useful work.</p>
        </div>
        <div className={styles.steps}>
          <article><span>01</span><h3>Set your training context</h3><p>Share your goal, experience, schedule, available equipment, and the constraints that actually shape your week.</p></article>
          <article><span>02</span><h3>Follow a structured plan</h3><p>Get dated sessions with clear movements, sets, reps, progression, substitutions, and video guidance where it helps.</p></article>
          <article><span>03</span><h3>Log, reflect, and adapt</h3><p>Complete the work, capture effort and movement summaries, then use your coach to make the next decision better.</p></article>
        </div>
      </section>

      <section className={styles.features} id="features" aria-labelledby="features-heading">
        <header className={styles.featuresHeader}>
          <div>
            <p className={styles.sectionEyebrow}>The complete training loop</p>
            <h2 id="features-heading">Plan. Execute.<br /><em>Learn. Repeat.</em></h2>
          </div>
          <p>Every surface shares the same context, so planning, coaching, movement feedback, and progress history reinforce each other.</p>
        </header>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article className={styles.featureCard} key={feature.number}>
              <div className={styles.featureTop}><span>{feature.number}</span><p>{feature.eyebrow}</p></div>
              <FeatureVisual kind={feature.kind} />
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.privacy} id="privacy" aria-labelledby="privacy-heading">
        <div className={styles.privacyMark} aria-hidden="true"><span>◎</span><i /></div>
        <div>
          <p className={styles.sectionEyebrow}>Privacy is part of the architecture</p>
          <h2 id="privacy-heading">Your camera is for your workout.<br /><em>Not our servers.</em></h2>
        </div>
        <p>Camera access is always opt-in. Supported movement tracking is processed in your browser, and forgefit.space receives only compact rep timing and workout summaries—not raw video.</p>
      </section>

      <section className={styles.finalCta} aria-labelledby="cta-heading">
        <div className={styles.ctaGrid} aria-hidden="true" />
        <p className={styles.sectionEyebrow}>Your strongest system starts with one session</p>
        <h2 id="cta-heading">Stop guessing.<br /><em>Start building.</em></h2>
        <p>Give your training the context it deserves. forgefit.space will turn it into the next clear move.</p>
        <Link className={styles.lightCta} href="/signin">Start training <Arrow /></Link>
      </section>

      <footer className={styles.footer}>
        <BrandLockup />
        <p>Adaptive training intelligence for real life.</p>
        <div><a href="#how-it-works">How it works</a><a href="#features">Product</a><a href="#privacy">Privacy</a><Link href="/signin">Sign in</Link></div>
        <small>© {new Date().getFullYear()} forgefit.space · Fitness guidance, not medical care.</small>
      </footer>
    </main>
  );
}
