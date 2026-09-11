import Link from "next/link";
import styles from "./LandingPage.module.css";

function Arrow({ direction = "right" }: { direction?: "right" | "up" }) {
  return <span aria-hidden="true">{direction === "up" ? "↗" : "→"}</span>;
}

function UnifiedBrandLockup() {
  return (
    <span className={styles.unifiedBrand} role="img" aria-label="Unified agents">
      <span className={styles.unifiedSymbol} aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="9" fill="currentColor" />
          <path d="M9.25 9.25v6.35c0 4.72 2.45 7.15 6.75 7.15s6.75-2.43 6.75-7.15V9.25" stroke="#F7F7F4" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="9.25" cy="9.25" r="2" fill="#B8BDE8" />
          <circle cx="22.75" cy="9.25" r="2" fill="#B8BDE8" />
        </svg>
      </span>
      <span className={styles.unifiedWord} aria-hidden="true">unified<small>agents</small></span>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path d="m4 9.2 3.1 3.1L14 5.8" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.4 18.3h10a4.2 4.2 0 0 0 .5-8.4A6 6 0 0 0 6.5 8.2a5.1 5.1 0 0 0 .9 10.1Z" />
    </svg>
  );
}

function EdgeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="5" y="4" width="14" height="16" rx="3" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function VoiceBars() {
  return (
    <span className={styles.voiceBars} aria-hidden="true">
      {[10, 18, 28, 16, 23, 32, 18, 25, 12, 20, 8].map((height, index) => (
        <i key={`${height}-${index}`} style={{ height }} />
      ))}
    </span>
  );
}

const workspaceNavigation = [
  ["Overview", "home"],
  ["Agents", "spark"],
  ["Conversations", "message"],
  ["Deployments", "deploy"],
  ["Evaluations", "check"],
] as const;

function NavGlyph({ name }: { name: (typeof workspaceNavigation)[number][1] }) {
  if (name === "home") return <svg viewBox="0 0 20 20"><path d="M3.5 9 10 3.5 16.5 9v7.5h-5v-4h-3v4h-5V9Z" /></svg>;
  if (name === "spark") return <svg viewBox="0 0 20 20"><path d="m10 2 1.5 4.4L16 8l-4.5 1.6L10 14l-1.5-4.4L4 8l4.5-1.6L10 2Z" /><path d="m15.5 13 .7 2 .2.6.6.2 2 .7-2 .7-.6.2-.2.6-.7 2-.7-2-.2-.6-.6-.2-2-.7 2-.7.6-.2.2-.6.7-2Z" /></svg>;
  if (name === "message") return <svg viewBox="0 0 20 20"><path d="M3 4.5h14v9H9l-4 3v-3H3v-9Z" /></svg>;
  if (name === "deploy") return <svg viewBox="0 0 20 20"><path d="M4 5h5v4H4V5Zm7 6h5v4h-5v-4Zm-5 0v4m8-10v4M9 7h5m-8 6h5" /></svg>;
  return <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" /><path d="m7 10 2 2 4-4" /></svg>;
}

function StudioPreview() {
  return (
    <div className={styles.studioFrame} aria-label="Agent Studio workflow preview">
      <div className={styles.studioTopbar}>
        <span><i /><i /><i /></span>
        <p><b>Northstar workspace</b><small>agent studio</small></p>
        <em>BG</em>
      </div>
      <div className={styles.studioBody}>
        <aside className={styles.studioSidebar}>
          <span className={styles.miniMark}>U</span>
          <nav aria-label="Agent Studio preview navigation">
            {workspaceNavigation.map(([label, icon], index) => (
              <span className={index === 1 ? styles.previewNavActive : ""} key={label}>
                <NavGlyph name={icon} /><b>{label}</b>
              </span>
            ))}
          </nav>
          <p><i /> All systems normal</p>
        </aside>
        <div className={styles.studioContent}>
          <header>
            <div><span>Agent / New</span><h2>Build a customer onboarding agent</h2></div>
            <span className={styles.previewButton}>Save draft</span>
          </header>
          <div className={styles.builderGrid}>
            <section className={styles.copilotPanel}>
              <span className={styles.panelLabel}>Agent Copilot</span>
              <h3>Tell me what this agent should accomplish.</h3>
              <p>I&apos;ll turn your description into a plan you can review before anything is published.</p>
              <div className={styles.voiceInput}>
                <span className={styles.micDot} aria-hidden="true">●</span>
                <VoiceBars />
                <small>Listening</small>
                <b>00:18</b>
              </div>
              <p className={styles.transcript}>“Guide new customers through setup, answer product questions, and hand off billing issues to a person.”</p>
              <div className={styles.inputActions}><span>Type instead</span><strong>Review plan <Arrow /></strong></div>
            </section>
            <aside className={styles.reviewPanel}>
              <header><span>Draft review</span><b>Ready to test</b></header>
              <dl>
                <div><dt>Purpose</dt><dd>Customer onboarding</dd></div>
                <div><dt>Audience</dt><dd>New workspace admins</dd></div>
                <div><dt>Runtime</dt><dd><i /> Cloud · Web</dd></div>
              </dl>
              <div className={styles.qualityScore}>
                <span><b>Quality review</b><small>5 checks passed</small></span><strong>92</strong>
              </div>
              <ul>
                <li><CheckIcon /> Goal is specific</li>
                <li><CheckIcon /> Human handoff defined</li>
                <li><CheckIcon /> Test scenarios ready</li>
              </ul>
            </aside>
          </div>
          <footer className={styles.previewTimeline}>
            {[
              ["01", "Describe", "Complete"],
              ["02", "Review", "Complete"],
              ["03", "Test", "Next"],
              ["04", "Deploy", "Cloud or Edge"],
            ].map(([number, title, status], index) => (
              <div data-active={index < 2} key={number}><i>{index < 2 ? "✓" : number}</i><span><b>{title}</b><small>{status}</small></span></div>
            ))}
          </footer>
        </div>
      </div>
    </div>
  );
}

const journey = [
  { number: "01", title: "Describe the outcome", copy: "Speak naturally or type. The Copilot captures purpose, audience, tone, knowledge, tools, and deployment needs." },
  { number: "02", title: "Review the plan", copy: "See assumptions, boundaries, missing context, expected cost, and a concise recommendation before saving a draft." },
  { number: "03", title: "Test what matters", copy: "Run realistic scenarios, inspect structured traces, compare outputs, and turn failures into repeatable evaluations." },
  { number: "04", title: "Release with control", copy: "Promote an immutable version to test, staging, or production. Monitor it and roll back without rebuilding." },
];

const distribution = [
  ["Hosted page", "Launch a polished agent experience without writing product code.", "01"],
  ["Web embed", "Add an origin-restricted, brand-aware agent to an approved site.", "02"],
  ["JavaScript + React", "Build with typed clients, headless hooks, and resumable events.", "03"],
  ["API + realtime", "Use scoped server keys, short-lived sessions, REST, SSE, or WebSocket.", "04"],
  ["Edge Hub", "Pair a local hub for offline sites with signed bundles and controlled sync.", "05"],
] as const;

export default function LandingPage({
  showCareer = false,
  showFitness = false,
}: {
  showCareer?: boolean;
  showFitness?: boolean;
}) {
  const studioUrl = "/signin?callbackUrl=/studio";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Unified home">
          <UnifiedBrandLockup />
        </Link>
        <nav className={styles.primaryNav} aria-label="Product navigation">
          <a href="#platform">Platform</a>
          <a href="#runtimes">Cloud &amp; Edge</a>
          <a href="#deploy">Deploy</a>
          <a href="#pricing">Plans</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signIn} href={studioUrl}>Sign in</Link>
          <Link className={styles.headerCta} href={studioUrl}>Create an agent <Arrow /></Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> Agent Studio · Cloud · Edge</p>
          <h1>Build the agent.<br /><em>Decide where it runs.</em></h1>
          <p className={styles.lead}>One calm control plane to shape, test, deploy, and improve AI agents—for customer products in the cloud and local operations at the edge.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href={studioUrl}>Create your first agent <Arrow /></Link>
            <a className={styles.secondaryCta} href="#workflow">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <div className={styles.heroMeta} aria-label="Platform availability">
            <span><i /> Studio foundation available</span>
            <span><i /> Cloud runtime available</span>
            <span className={styles.earlyAccess}><i /> Edge runtime in development</span>
          </div>
        </div>
        <div className={styles.heroPreview}><StudioPreview /></div>
      </section>

      <section className={styles.proofStrip} aria-label="Platform principles">
        <p><span>01</span><b>Provider-neutral by design</b><small>Managed models or your own approved credentials.</small></p>
        <p><span>02</span><b>Review before release</b><small>Nothing is silently published or deployed.</small></p>
        <p><span>03</span><b>One version, visible everywhere</b><small>Trace the exact behavior across each runtime.</small></p>
      </section>

      <section className={styles.workflow} id="workflow">
        <header className={styles.sectionHeader}>
          <p className={styles.eyebrow}><span /> From intent to a controlled release</p>
          <h2>Less configuration theatre.<br /><em>More useful decisions.</em></h2>
          <p>Start with the job your agent needs to do. Unified turns it into a reviewable plan and keeps you in control at every consequential step.</p>
        </header>
        <ol className={styles.journeyGrid}>
          {journey.map((item) => (
            <li key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.platform} id="platform">
        <div className={styles.platformIntro}>
          <p className={styles.eyebrow}><span /> Agent Studio</p>
          <h2>A workspace that helps you build the <em>right</em> agent.</h2>
          <p>Agent Copilot does more than fill fields. It challenges scope, surfaces assumptions, proposes safer alternatives, and turns your intent into an editable implementation plan.</p>
          <Link href={studioUrl}>Explore Agent Studio <Arrow /></Link>
        </div>
        <div className={styles.platformCards}>
          <article className={styles.voiceCard}>
            <span className={styles.cardKicker}>VOICE-LED ONBOARDING</span>
            <VoiceBars />
            <h3>Talk it through.</h3>
            <p>Describe the outcome in your own words. Correct the transcript, answer only the questions that matter, or switch to typing at any time.</p>
            <small>Voice never becomes publish permission.</small>
          </article>
          <article className={styles.qualityCard}>
            <header><span className={styles.cardKicker}>QUALITY REVIEW</span><strong>92<small>/100</small></strong></header>
            <div><span><CheckIcon /> Goal clarity</span><b>Strong</b></div>
            <div><span><CheckIcon /> Knowledge coverage</span><b>Ready</b></div>
            <div><span><CheckIcon /> Deployment fit</span><b>Cloud</b></div>
            <div><span><i className={styles.warningDot} /> Edge fallback</span><b>Review</b></div>
            <p>Hard safety and compatibility failures block publish. Recommendations stay concise and actionable.</p>
          </article>
          <article className={styles.versionCard}>
            <span className={styles.cardKicker}>VERSIONED BY DEFAULT</span>
            <h3>Every release has a reason.</h3>
            <ul>
              <li><i>v12</i><span><b>Production</b><small>Customer onboarding · 100%</small></span><em>Healthy</em></li>
              <li><i>v13</i><span><b>Staging</b><small>New billing handoff rules</small></span><em>Testing</em></li>
              <li><i>v11</i><span><b>Previous</b><small>Rollback available</small></span><em>Stable</em></li>
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.runtimes} id="runtimes">
        <header className={styles.sectionHeader}>
          <p className={styles.eyebrow}><span /> Two runtimes, one control plane</p>
          <h2>Choose the operating model<br /><em>the work actually needs.</em></h2>
        </header>
        <div className={styles.runtimeGrid}>
          <article className={styles.cloudCard}>
            <header><span className={styles.runtimeIcon}><CloudIcon /></span><div><small>AVAILABLE</small><h3>Cloud Runtime</h3></div></header>
            <p>Managed reach for web and mobile experiences, with streaming sessions, model routing, usage controls, and centralized visibility.</p>
            <ul>
              <li><CheckIcon /> Autoscaled web sessions</li>
              <li><CheckIcon /> Managed or BYO providers</li>
              <li><CheckIcon /> Conversation and run traces</li>
              <li><CheckIcon /> Environment promotion and rollback</li>
            </ul>
            <footer><span>Best for</span><b>Customer products · teams · rapid iteration</b></footer>
          </article>
          <article className={styles.edgeCard}>
            <header><span className={styles.runtimeIcon}><EdgeIcon /></span><div><small>EARLY ACCESS ROADMAP</small><h3>Edge Runtime</h3></div></header>
            <p>Signed agents for local hubs and physical sites, designed to keep declared workflows running through internet loss.</p>
            <ul>
              <li><CheckIcon /> Local model and tool adapters</li>
              <li><CheckIcon /> Encrypted offline state</li>
              <li><CheckIcon /> QR pairing and device identity</li>
              <li><CheckIcon /> Controlled, idempotent sync</li>
            </ul>
            <footer><span>Best for</span><b>Sites · devices · privacy-sensitive operations</b></footer>
          </article>
        </div>
      </section>

      <section className={styles.deploy} id="deploy">
        <header>
          <div><p className={styles.eyebrow}><span /> Distribution</p><h2>Meet customers where they already are.</h2></div>
          <p>Publish one reviewed version, then expose it through the surfaces each environment allows. Client apps never receive a long-lived server secret.</p>
        </header>
        <div className={styles.distributionGrid}>
          {distribution.map(([title, copy, number], index) => (
            <article data-planned={index === distribution.length - 1} key={title}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
              <em>{index === distribution.length - 1 ? "Planned" : "Platform path"}</em>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.operations}>
        <div className={styles.operationsCopy}>
          <p className={styles.eyebrow}><span /> Operate with evidence</p>
          <h2>Understand what happened.<br /><em>Improve what happens next.</em></h2>
          <p>Review conversations beside the exact version, model route, tool steps, latency, and cost. Turn weak runs into test cases before changing production.</p>
          <ul>
            <li><CheckIcon /> Conversation review with privacy-aware traces</li>
            <li><CheckIcon /> Provider and deployment health</li>
            <li><CheckIcon /> Exact usage attribution and budgets</li>
            <li><CheckIcon /> Evaluation gates before publish</li>
          </ul>
        </div>
        <div className={styles.tracePanel} aria-label="Conversation trace preview">
          <header><div><span>Conversation trace</span><b>#cnv_0248</b></div><em><i /> Completed</em></header>
          <div className={styles.traceSummary}>
            <p><small>Agent</small><b>Onboarding assistant</b></p>
            <p><small>Release</small><b>Production · v12</b></p>
            <p><small>Runtime</small><b>Cloud · web</b></p>
          </div>
          <ol>
            <li><span>01</span><div><b>Input policy</b><small>12 ms · passed</small></div><em>✓</em></li>
            <li><span>02</span><div><b>Context assembly</b><small>6 sources · 1.8K tokens</small></div><em>✓</em></li>
            <li><span>03</span><div><b>Model response</b><small>Balanced route · 842 ms</small></div><em>✓</em></li>
            <li><span>04</span><div><b>Human handoff</b><small>Billing intent · policy matched</small></div><em>→</em></li>
          </ol>
          <footer><span>Total latency <b>1.04 s</b></span><span>Estimated cost <b>$0.0042</b></span></footer>
        </div>
      </section>

      <section className={styles.providers} id="security">
        <div>
          <p className={styles.eyebrow}><span /> Provider choice</p>
          <h2>Your agent is the product.<br /><em>The model is a route.</em></h2>
        </div>
        <div className={styles.providerContent}>
          <p>Use managed credits for speed, bring approved provider credentials for control, or mix both under a workspace policy. Every run records the actual route and cost attribution.</p>
          <ul>
            <li><b>Multiple connections</b><span>Gemini, OpenAI, Anthropic, and compatible endpoints through one runtime contract.</span></li>
            <li><b>Scoped credentials</b><span>Encrypted workspace secrets, role-controlled rotation, and no plaintext echo.</span></li>
            <li><b>Policy-safe fallback</b><span>Never cross provider, region, credential mode, or local-only promises without explicit approval.</span></li>
          </ul>
        </div>
      </section>

      <section className={styles.pricing} id="pricing">
        <header className={styles.sectionHeader}>
          <p className={styles.eyebrow}><span /> Plans that scale with responsibility</p>
          <h2>Useful from the first agent.<br /><em>Governed when the stakes grow.</em></h2>
          <p>Final commercial pricing follows customer validation. The product architecture already separates platform access, managed credits, and customer-owned provider spend.</p>
        </header>
        <div className={styles.pricingGrid}>
          <article>
            <span>Developer</span><h3>Explore with a real agent.</h3><p>One workspace, Studio, Cloud test deployment, hosted page, BYO provider, recent traces, and basic evaluations.</p>
            <b>Free to explore</b><Link href={studioUrl}>Start building <Arrow /></Link>
          </article>
          <article className={styles.featuredPlan}>
            <span>Team</span><h3>Ship and improve together.</h3><p>Production surfaces, shared reviews, longer history, environments, rollback, budgets, managed credits or BYO.</p>
            <b>Usage-based</b><Link href={studioUrl}>Create a workspace <Arrow /></Link>
          </article>
          <article>
            <span>Business + Edge</span><h3>Operate with deeper control.</h3><p>Advanced roles, approvals, audit export, orchestration, higher capacity, and Edge fleet controls as they enter early access.</p>
            <b>Early-access roadmap</b><a href="#runtimes">Review Cloud &amp; Edge <Arrow direction="up" /></a>
          </article>
        </div>
      </section>

      {/* Legacy products remain preserved behind server-controlled rollback flags. */}
      {(showFitness || showCareer) && (
        <section className={styles.legacyProducts} aria-label="Legacy personal products">
          <div><span>Legacy personal workspaces</span><p>Temporarily available for continuity while the general agent platform becomes the primary product.</p></div>
          <nav>
            {showFitness && <Link href="/fitness">FitAI Coach <Arrow /></Link>}
            {showCareer && <Link href="/career">Career Readiness <Arrow /></Link>}
          </nav>
        </section>
      )}

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}><span /> Start with the outcome</p>
        <h2>Describe the agent you need.<br /><em>Review the plan before it ships.</em></h2>
        <p>Begin with voice or text, keep every important decision visible, and move into Cloud deployment without starting from a blank configuration screen.</p>
        <div><Link className={styles.primaryCta} href={studioUrl}>Create an agent <Arrow /></Link><a className={styles.secondaryCta} href="#platform">Review the platform</a></div>
      </section>

      <footer className={styles.footer}>
        <UnifiedBrandLockup />
        <p>One control plane for considered agent deployment.</p>
        <nav aria-label="Footer navigation"><a href="#platform">Platform</a>{showFitness && <Link href="/exercises">Exercise library</Link>}<a href="#pricing">Plans</a><Link href={studioUrl}>Sign in</Link></nav>
      </footer>
    </main>
  );
}
