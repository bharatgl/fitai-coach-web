import Link from "next/link";
import styles from "./LandingPage.module.css";

const features = [
  {
    number: "01",
    title: "A plan that moves with you",
    copy: "Your schedule, experience, equipment, and goals shape every session—so the next workout always feels realistic.",
    tone: "mint",
  },
  {
    number: "02",
    title: "Coaching with context",
    copy: "Ask questions, adjust a session, or talk through a setback. FitAI keeps your training context close at hand.",
    tone: "cream",
  },
  {
    number: "03",
    title: "Movement insights, on device",
    copy: "Use your camera for supported exercises and track reps in the browser, with privacy built into the experience.",
    tone: "blue",
  },
];

function Brand() {
  return (
    <span className={styles.brand} aria-label="FitAI Coach">
      <span className={styles.brandMark} aria-hidden="true">F</span>
      <span>FitAI <em>Coach</em></span>
    </span>
  );
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <Link className={styles.brandLink} href="/" aria-label="FitAI Coach home">
          <Brand />
        </Link>
        <nav className={styles.nav} aria-label="Landing page navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signIn} href="/signin">Sign in</Link>
          <Link className={styles.headerCta} href="/signin">Start training <Arrow /></Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-heading">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true">✦</span> Personal coaching, built around you</p>
          <h1 id="landing-heading">Training that adapts when <em>life does.</em></h1>
          <p className={styles.heroText}>
            A thoughtful AI fitness coach that turns your goals, schedule, and progress into a plan you can actually follow.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/signin">Build my plan <Arrow /></Link>
            <a className={styles.secondaryCta} href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.promiseRow} aria-label="Product highlights">
            <span><i aria-hidden="true">✓</i> Personalized plan</span>
            <span><i aria-hidden="true">✓</i> No equipment required</span>
            <span><i aria-hidden="true">✓</i> Privacy-aware tracking</span>
          </div>
        </div>

        <div className={styles.productStage} aria-label="Preview of the FitAI Coach dashboard">
          <div className={styles.orbitOne} aria-hidden="true" />
          <div className={styles.orbitTwo} aria-hidden="true" />
          <article className={styles.dashboardCard}>
            <header className={styles.dashboardHeader}>
              <Brand />
              <span className={styles.avatar}>AG</span>
            </header>
            <div className={styles.dashboardBody}>
              <div className={styles.dashboardIntro}>
                <div>
                  <span className={styles.tinyLabel}>TUESDAY • YOUR PLAN</span>
                  <h2>Ready to move?</h2>
                  <p>Today is about steady strength.</p>
                </div>
                <span className={styles.readiness}><strong>82</strong><small>ready</small></span>
              </div>
              <div className={styles.workoutCard}>
                <div className={styles.workoutIcon} aria-hidden="true">↗</div>
                <div>
                  <span className={styles.tinyLabel}>TODAY&apos;S SESSION</span>
                  <h3>Full-body foundation</h3>
                  <p>42 min · 6 movements · Moderate</p>
                </div>
                <span className={styles.play} aria-hidden="true">▶</span>
              </div>
              <div className={styles.coachNote}>
                <span className={styles.coachSpark} aria-hidden="true">✦</span>
                <p><strong>Coach note</strong> Your recovery looks good. I kept the pace steady and added a little more pulling volume.</p>
              </div>
            </div>
          </article>
          <aside className={styles.progressCard}>
            <span className={styles.tinyLabel}>THIS WEEK</span>
            <div className={styles.progressRing}><strong>3</strong><span>of 4</span></div>
            <p>One session to your weekly goal.</p>
          </aside>
          <aside className={styles.liveCard}>
            <span className={styles.liveDot} aria-hidden="true" />
            <div><strong>Movement tracking</strong><small>Runs in your browser</small></div>
          </aside>
        </div>
      </section>

      <section className={styles.valueStrip} aria-label="Why FitAI Coach">
        <p>One calm place for</p>
        <div><span>Adaptive plans</span><i>•</i><span>Workout guidance</span><i>•</i><span>Progress history</span><i>•</i><span>Coach conversations</span></div>
      </section>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionEyebrow}>A plan with a point of view</p>
          <h2 id="how-heading">Less guesswork.<br /><em>More good days.</em></h2>
        </div>
        <div className={styles.steps}>
          <article>
            <span>1</span>
            <h3>Tell us where you are</h3>
            <p>Share your goal, training experience, schedule, and the equipment you have access to.</p>
          </article>
          <article>
            <span>2</span>
            <h3>Get a plan that fits</h3>
            <p>FitAI turns that context into practical sessions with clear exercises, sets, reps, and intent.</p>
          </article>
          <article>
            <span>3</span>
            <h3>Train, reflect, adjust</h3>
            <p>Log the work, see your history, and use your coach to make the next session feel right.</p>
          </article>
        </div>
      </section>

      <section className={styles.features} id="features" aria-labelledby="features-heading">
        <header className={styles.featuresHeader}>
          <div>
            <p className={styles.sectionEyebrow}>Built for consistency</p>
            <h2 id="features-heading">Everything you need.<br /><em>Nothing you don&apos;t.</em></h2>
          </div>
          <p>Fitness tools should make training feel clearer, not busier. FitAI brings planning, coaching, movement, and progress into one focused workspace.</p>
        </header>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article className={`${styles.featureCard} ${styles[feature.tone]}`} key={feature.number}>
              <span className={styles.featureNumber}>{feature.number}</span>
              <div className={styles.featureVisual} aria-hidden="true">
                {feature.number === "01" && <><i /><i /><i /><b /></>}
                {feature.number === "02" && <><p>How should I adjust today?</p><p>Let&apos;s keep the habit and lower the load.</p></>}
                {feature.number === "03" && <><span className={styles.bodyHead} /><span className={styles.bodyLine} /><span className={styles.trackingPoint}>●</span></>}
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.privacy} id="privacy" aria-labelledby="privacy-heading">
        <div className={styles.privacyMark} aria-hidden="true"><span>◎</span></div>
        <div>
          <p className={styles.sectionEyebrow}>Privacy-aware by design</p>
          <h2 id="privacy-heading">Your training is personal.<br />We treat it that way.</h2>
        </div>
        <p>Movement tracking for supported exercises happens in your browser. Camera access is always opt-in, with clear controls that keep you in charge.</p>
      </section>

      <section className={styles.finalCta} aria-labelledby="cta-heading">
        <div className={styles.ctaHalo} aria-hidden="true" />
        <p className={styles.sectionEyebrow}>Your next session starts here</p>
        <h2 id="cta-heading">Build a fitness rhythm<br />that feels like <em>yours.</em></h2>
        <p>Start with your goals. FitAI will help you turn them into the next doable step.</p>
        <Link className={styles.lightCta} href="/signin">Start training <Arrow /></Link>
      </section>

      <footer className={styles.footer}>
        <Brand />
        <p>Thoughtful training, one session at a time.</p>
        <div><a href="#how-it-works">How it works</a><a href="#features">Features</a><Link href="/signin">Sign in</Link></div>
        <small>© {new Date().getFullYear()} FitAI Coach. Fitness guidance, not medical care.</small>
      </footer>
    </main>
  );
}
