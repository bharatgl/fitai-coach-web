import Link from "next/link";
import styles from "./FitAIEntry.module.css";

export function FitAIEntry() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/fitness" aria-label="FitAI Coach home"><b>FITAI</b><span>COACH</span></Link>
        <nav aria-label="Fitness navigation"><a href="#session">Today</a><a href="#method">Method</a><Link href="/exercises">Movements</Link></nav>
        <Link className={styles.signIn} href="/signin?callbackUrl=/fitness">Athlete sign in <span>↗</span></Link>
      </header>

      <section className={styles.hero} id="session">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Adaptive training / built for today</p>
          <h1>Train with intent.<br /><em>Progress on proof.</em></h1>
          <p className={styles.lead}>Your plan, readiness, live sets, and training history—working together to make the next session count.</p>
          <div className={styles.actions}><Link href="/signin?callbackUrl=/fitness">Build my training plan <span>→</span></Link><a href="#method">See the method</a></div>
        </div>

        <div className={styles.scoreboard} aria-label="Sample training scorecard">
          <div className={styles.scoreTop}><span><i /> SESSION READY</span><small>W02 / D03</small></div>
          <div className={styles.readiness}><span><small>READINESS</small><strong>82</strong></span><p>Recovery supports planned load.<br /><b>Keep 2 reps in reserve.</b></p></div>
          <div className={styles.sessionTitle}><small>TODAY / FULL BODY</small><h2>Strength<br />Foundation</h2></div>
          <dl><div><dt>DURATION</dt><dd>42 <small>min</small></dd></div><div><dt>MOVEMENTS</dt><dd>06</dd></div><div><dt>WORK SETS</dt><dd>18</dd></div></dl>
          <ol><li><b>01</b><span>Goblet squat<small>3 × 8–10</small></span></li><li><b>02</b><span>Floor press<small>3 × 8–12</small></span></li><li><b>03</b><span>One-arm row<small>3 × 10</small></span></li></ol>
          <span className={styles.privacy}>ON-DEVICE MOVEMENT ASSIST / FRAMES STAY LOCAL</span>
        </div>
      </section>

      <section className={styles.method} id="method">
        <header><p>THE TRAINING METHOD</p><h2>Prepare. Execute. <em>Earn the next load.</em></h2></header>
        <div>
          <article><span>01 / READINESS</span><h3>Check readiness</h3><p>Sleep, energy, soreness, stress, and motivation establish the day’s honest baseline.</p></article>
          <article><span>02 / SESSION</span><h3>Execute the plan</h3><p>Loads, reps, effort, substitutions, and movement quality stay attached to the session.</p></article>
          <article><span>03 / PROGRESSION</span><h3>Adapt what comes next</h3><p>Completed work shapes the next decision, without pretending every day is identical.</p></article>
        </div>
      </section>

      <footer><Link className={styles.wordmark} href="/fitness"><b>FITAI</b><span>COACH</span></Link><p>Fitness guidance, not medical care.</p><Link href="/career">Career Readiness ↗</Link></footer>
    </main>
  );
}
