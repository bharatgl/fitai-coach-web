"use client";

import type {
  BotDefinition,
  BotListResponse,
  BotResponse,
  CareerApplication,
  CareerApplicationResponse,
  CareerApplicationStatus,
  CareerInterviewResponse,
  CareerOverviewResponse,
  CareerProfileResponse,
  CareerTargetResponse,
  CareerWorkMode,
} from "@fitai/contracts";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import styles from "./CareerReadiness.module.css";

type CurrentUser = { id: string; name: string; email: string };

const journey = [
  {
    number: "01",
    stage: "Direction",
    title: "Choose the right target",
    copy: "Turn your experience, constraints, and goals into a focused role and seniority brief.",
    action: "Build my role brief",
    prompt: "Help me choose a focused target role. Use my actual experience, strengths, location or remote preference, and constraints. Ask only for missing facts, then give me a concise role and seniority brief.",
  },
  {
    number: "02",
    stage: "Opportunities",
    title: "Find roles worth pursuing",
    copy: "Search current openings and show dated evidence with direct employer or canonical ATS links.",
    action: "Find current roles",
    prompt: "Find current jobs that match my experience, target seniority, and location or remote preference. Return only verified active listings with direct employer or canonical ATS application links.",
  },
  {
    number: "03",
    stage: "Application",
    title: "Make your evidence sharper",
    copy: "Review a resume, LinkedIn export, screenshots, or repository without inventing impact or credentials.",
    action: "Review my materials",
    prompt: "Review my resume and LinkedIn evidence for my target roles. Start with the highest-impact truthful changes, give exact replacement wording, and clearly identify any facts or metrics I still need to supply.",
  },
  {
    number: "04",
    stage: "Interview",
    title: "Practise under pressure",
    copy: "Run one-question-at-a-time mock interviews, then debrief the substance, structure, and delivery.",
    action: "Start interview practice",
    prompt: "Run a realistic mock interview for my target role. Ask one question at a time, follow up naturally, and save the detailed feedback until I answer.",
  },
] as const;

function isCareerBot(bot: BotDefinition) {
  return bot.vertical === "interview" || bot.vertical === "resume";
}

function preferredCareerBot(bots: BotDefinition[]) {
  const careerBots = bots.filter(isCareerBot);
  return careerBots.find((bot) => bot.status === "active" && bot.vertical === "interview")
    ?? careerBots.find((bot) => bot.status === "active")
    ?? careerBots.find((bot) => bot.vertical === "interview")
    ?? careerBots[0]
    ?? null;
}

function workspaceHref(bot: BotDefinition, prompt: string, interviewSessionId?: string) {
  const session = interviewSessionId ? `&careerSession=${encodeURIComponent(interviewSessionId)}` : "";
  return `/studio/bots/${bot.id}?from=career&prompt=${encodeURIComponent(prompt)}${session}`;
}

const applicationTransitions: Record<CareerApplicationStatus, CareerApplicationStatus[]> = {
  saved: ["preparing", "withdrawn"],
  preparing: ["saved", "applied", "withdrawn"],
  applied: ["interviewing", "offer", "rejected", "withdrawn"],
  interviewing: ["offer", "rejected", "withdrawn"],
  offer: ["accepted", "rejected", "withdrawn"],
  accepted: [], rejected: ["saved"], withdrawn: ["saved"],
};

function commaList(value: FormDataEntryValue | null) {
  return [...new Set(String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean))];
}

export function CareerProductEntry() {
  return (
    <main className={`${styles.page} ${styles.publicEntry}`}>
      <header className={styles.header}>
        <Link href="/career" aria-label="Career Readiness home"><b>CAREER</b><span>READINESS</span></Link>
        <nav><a href="#career-journey">The practice</a><a href="#career-journey">Outcomes</a><Link href="/">ForgeFit</Link></nav>
        <Link className={styles.entrySignIn} href="/signin?callbackUrl=/career">Open my workspace ↗</Link>
      </header>
      <section className={styles.publicHero}>
        <div>
          <p className={styles.eyebrow}><span>VOL. 01</span> A practice for consequential moves</p>
          <h1>Your experience deserves a <em>sharper narrative.</em></h1>
          <p>Define the role, surface the proof, prepare with honesty, and walk into the interview knowing exactly what you bring.</p>
          <div className={styles.heroActions}><Link className={styles.primaryAction} href="/signin?callbackUrl=/career">Begin my private brief <span>↗</span></Link><a className={styles.secondaryAction} href="#career-journey">Read the approach ↓</a></div>
        </div>
        <aside>
          <span>THE WORKING BRIEF / 001</span>
          <h2>Ambition becomes credible when the evidence is specific.</h2>
          <dl><div><dt>Direction</dt><dd>A role worth the move</dd></div><div><dt>Evidence</dt><dd>Work you can defend</dd></div><div><dt>Practice</dt><dd>Stories ready for the room</dd></div></dl>
        </aside>
      </section>
      <section className={styles.publicJourney} id="career-journey">
        <header><p className={styles.eyebrow}><span /> The workflow</p><h2>From direction to <em>decision-ready.</em></h2></header>
        <div>{journey.map((step) => <article key={step.number}><span>{step.number}</span><small>{step.stage}</small><h3>{step.title}</h3><p>{step.copy}</p></article>)}</div>
      </section>
      <footer className={styles.footer}><Link href="/career"><b>CAREER</b><span>READINESS</span></Link><p>Career Readiness does not submit external applications.</p><nav><Link href="/fitness">FitAI Coach</Link><Link href="/signin?callbackUrl=/career">Sign in</Link></nav></footer>
    </main>
  );
}

export function CareerReadiness({ user }: { user: CurrentUser }) {
  const [bots, setBots] = useState<BotDefinition[]>([]);
  const [overview, setOverview] = useState<CareerOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const careerBots = useMemo(() => bots.filter(isCareerBot), [bots]);
  const coach = useMemo(() => preferredCareerBot(bots), [bots]);
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      apiRequest<BotListResponse>("/v1/bots", { signal: controller.signal }),
      apiRequest<CareerOverviewResponse>("/v1/career/overview", { signal: controller.signal }),
    ])
      .then(([botResponse, careerOverview]) => {
        setBots(botResponse.bots);
        setOverview(careerOverview);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Career Readiness could not load.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user.id]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("profile"); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    const years = String(data.get("yearsExperience") ?? "").trim();
    try {
      const response = await apiRequest<CareerProfileResponse>("/v1/career/profile", {
        method: "PUT",
        body: JSON.stringify({
          headline: String(data.get("headline") ?? ""), location: String(data.get("location") ?? ""),
          workMode: String(data.get("workMode") ?? "flexible") as CareerWorkMode,
          yearsExperience: years ? Number(years) : null, skills: commaList(data.get("skills")),
          strengths: String(data.get("strengths") ?? ""), constraints: String(data.get("constraints") ?? ""),
        }),
      });
      setOverview((current) => current ? { ...current, profile: response.profile, nextAction: current.targetRoles.length ? "find_roles" : "choose_target" } : current);
      setNotice("Career profile saved. Your coach can now use this context.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Career profile could not be saved."); }
    finally { setWorking(""); }
  }

  async function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("target"); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await apiRequest<CareerTargetResponse>("/v1/career/targets", {
        method: "POST",
        body: JSON.stringify({
          title: String(data.get("title") ?? ""), seniority: String(data.get("seniority") ?? "unspecified"),
          location: String(data.get("location") ?? ""), workMode: String(data.get("workMode") ?? "flexible"),
          mustHaveSkills: commaList(data.get("mustHaveSkills")), notes: String(data.get("notes") ?? ""), isPrimary: true,
        }),
      });
      setOverview((current) => current ? { ...current, targetRoles: [response.targetRole, ...current.targetRoles.map((target) => ({ ...target, isPrimary: false }))], nextAction: "find_roles" } : current);
      event.currentTarget.reset(); setNotice(`${response.targetRole.title} is now your primary target.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Target role could not be saved."); }
    finally { setWorking(""); }
  }

  async function addApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("application"); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    const primaryTarget = overview?.targetRoles.find((target) => target.isPrimary) ?? overview?.targetRoles[0];
    try {
      const response = await apiRequest<CareerApplicationResponse>("/v1/career/applications", {
        method: "POST",
        body: JSON.stringify({ targetRoleId: primaryTarget?.id ?? null, company: String(data.get("company") ?? ""), roleTitle: String(data.get("roleTitle") ?? ""), sourceUrl: String(data.get("sourceUrl") ?? "").trim() || null, status: "saved", nextAction: "Review fit and prepare truthful application evidence", nextActionDue: null, notes: String(data.get("notes") ?? "") }),
      });
      setOverview((current) => current ? { ...current, recentApplications: [response.application, ...current.recentApplications].slice(0, 8), progress: { ...current.progress, applicationCounts: { ...current.progress.applicationCounts, saved: current.progress.applicationCounts.saved + 1 } } } : current);
      event.currentTarget.reset(); setNotice("Opportunity saved to your application pipeline.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Opportunity could not be saved."); }
    finally { setWorking(""); }
  }

  async function updateApplicationStatus(application: CareerApplication, status: CareerApplicationStatus) {
    setWorking(application.id); setError(""); setNotice("");
    try {
      const response = await apiRequest<CareerApplicationResponse>(`/v1/career/applications/${application.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setOverview((current) => current ? { ...current, recentApplications: current.recentApplications.map((item) => item.id === application.id ? response.application : item), progress: { ...current.progress, applicationCounts: { ...current.progress.applicationCounts, [application.status]: Math.max(0, current.progress.applicationCounts[application.status] - 1), [status]: current.progress.applicationCounts[status] + 1 } } } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Application status could not be updated."); }
    finally { setWorking(""); }
  }

  async function startInterviewPractice() {
    if (!coach || coach.status !== "active" || working) return;
    const target = overview?.targetRoles.find((item) => item.isPrimary) ?? overview?.targetRoles[0];
    setWorking("interview"); setError(""); setNotice("");
    try {
      const response = await apiRequest<CareerInterviewResponse>("/v1/career/interviews", {
        method: "POST",
        body: JSON.stringify({ targetRoleId: target?.id ?? null, botId: coach.id, format: "general", competencies: ["role judgment", "evidence", "communication", "technical depth"], plannedMinutes: 25 }),
      });
      window.location.assign(workspaceHref(coach, journey[3].prompt, response.session.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Interview practice could not start."); setWorking(""); }
  }

  async function createCareerCoach() {
    if (creating) return;
    setCreating(true);
    setError("");
    setNotice("");
    let created: BotDefinition | null = null;
    try {
      const response = await apiRequest<BotResponse>("/v1/bots", {
        method: "POST",
        body: JSON.stringify({
          templateId: "interview_coach",
          name: "Career Readiness Coach",
        }),
      });
      created = response.bot;
      setBots((current) => [response.bot, ...current]);

      const activated = await apiRequest<BotResponse>(`/v1/bots/${response.bot.id}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBots((current) => current.map((bot) => bot.id === activated.bot.id ? activated.bot : bot));
      setNotice("Your private Career Readiness workspace is ready.");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "The career workspace could not be created.";
      setError(created
        ? `Your coach draft was saved, but it could not be activated yet: ${detail}`
        : detail);
    } finally {
      setCreating(false);
    }
  }

  const coachReady = coach?.status === "active";
  const primaryTarget = overview?.targetRoles.find((target) => target.isPrimary) ?? overview?.targetRoles[0];
  const applicationCount = overview
    ? Object.values(overview.progress.applicationCounts).reduce((sum, count) => sum + count, 0)
    : 0;
  const completedStages = overview
    ? Number(Boolean(overview.profile))
      + Number(Boolean(primaryTarget))
      + Number(applicationCount > 0)
      + Number(Boolean(overview.activeInterview || overview.progress.completedInterviews))
    : 0;
  const nextJourneyIndex = !overview?.profile || !primaryTarget
    ? 0
    : overview.activeInterview || overview.nextAction === "practice_interview"
      ? 3
      : overview.nextAction === "prepare_application"
        ? 2
        : 1;
  const nextJourneyStep = journey[nextJourneyIndex];
  const nextActionTitle = loading
    ? "Preparing your private workspace…"
    : overview?.nextAction === "complete_profile"
      ? "Start with the experience you can prove."
      : overview?.nextAction === "choose_target"
        ? "Choose one role worth preparing for."
        : overview?.nextAction === "prepare_application"
          ? "Sharpen the strongest application next."
          : overview?.nextAction === "practice_interview"
            ? "Turn your evidence into interview practice."
            : "Build a focused list of roles worth pursuing.";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/career" aria-label="Career Readiness home"><b>CAREER</b><span>READINESS</span></Link>
        <nav aria-label="Product navigation">
          <a className={styles.activeNav} href="#career-command-title">Overview</a>
          <a href="#application-pipeline">Pipeline</a>
          <a href="#journey">Practice</a>
        </nav>
        <div className={styles.account}><span>{user.name}</span><b>{initials}</b></div>
      </header>

      <section className={styles.workspaceIntro}>
        <div className={styles.workspaceLead}>
          <p className={styles.eyebrow}><span /> Private career workspace</p>
          <h1>{nextActionTitle}</h1>
          <p>{loading ? "Loading your career context and latest activity." : `${nextJourneyStep.copy} Your coach uses the profile, target, and evidence saved here.`}</p>
          <div className={styles.heroActions}>
            {loading ? <button disabled type="button">Opening workspace…</button> : coachReady && coach ? (
              <Link className={styles.primaryAction} href={workspaceHref(coach, nextJourneyStep.prompt, overview?.activeInterview?.id)}>
                {overview?.activeInterview ? "Resume interview practice" : nextJourneyStep.action} <span>→</span>
              </Link>
            ) : coach ? <Link className={styles.primaryAction} href={`/studio?bot=${coach.id}`}>Finish coach setup <span>→</span></Link> : (
              <button disabled={creating} onClick={() => void createCareerCoach()} type="button">{creating ? "Creating your coach…" : "Create my private coach"} <span>→</span></button>
            )}
            <a className={styles.secondaryAction} href="#career-command-title">Review my brief ↓</a>
          </div>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        <aside className={styles.workspaceProgress} aria-label={`${completedStages} of 4 career readiness stages started`}>
          <header><span>READINESS PATH</span><b>{completedStages}<small>/04</small></b></header>
          <ol>
            {journey.map((item, index) => <li className={index < completedStages ? styles.completeStage : index === completedStages ? styles.currentStage : ""} key={item.stage}><span>{index < completedStages ? "✓" : item.number}</span><div><b>{item.stage}</b><small>{index === completedStages ? "Next focus" : index < completedStages ? "Context saved" : "Not started"}</small></div></li>)}
          </ol>
          <p>{primaryTarget ? <><span>PRIMARY TARGET</span><b>{primaryTarget.title}</b><small>{primaryTarget.seniority} · {primaryTarget.workMode}</small></> : <><span>PRIMARY TARGET</span><b>Not defined yet</b><small>Set one role before broadening the search.</small></>}</p>
        </aside>
      </section>

      <section className={styles.commandCenter} aria-labelledby="career-command-title">
        <header>
          <div><p className={styles.eyebrow}><span /> Your current position</p><h2 id="career-command-title">{loading ? "Bringing your career context together." : overview?.nextAction === "complete_profile" ? "Start with credible context." : overview?.nextAction === "choose_target" ? "Define the role before the search." : overview?.nextAction === "prepare_application" ? "Finish the strongest application next." : overview?.nextAction === "practice_interview" ? "Turn preparation into practice." : "Find a small set of roles worth pursuing."}</h2></div>
          <dl><div><dt>Active targets</dt><dd>{loading ? "—" : overview?.targetRoles.length ?? 0}</dd></div><div><dt>Applications</dt><dd>{loading ? "—" : applicationCount}</dd></div><div><dt>Practices</dt><dd>{loading ? "—" : overview?.progress.completedInterviews ?? 0}</dd></div></dl>
        </header>
        {loading ? (
          <div className={styles.workspaceLoading} role="status" aria-live="polite"><i /><div><b>Loading your brief</b><span>Profile, targets, pipeline, and practice history</span></div><i /><i /></div>
        ) : !overview ? (
          <div className={styles.workspaceError} role="alert"><b>Your career workspace could not be opened.</b><p>{error || "Check the connection and try again."}</p><button onClick={() => window.location.reload()} type="button">Try again</button></div>
        ) : <div className={styles.commandGrid}>
          <article className={styles.contextPanel}>
            <div><span>01 · PROFILE</span><h3>Career evidence</h3><p>{overview?.profile?.headline || "Capture only the background your coach needs."}</p></div>
            <details open={!overview?.profile}>
              <summary>{overview?.profile ? "Edit profile" : "Complete profile"}</summary>
              <form key={overview?.profile?.updatedAt ?? "new-profile"} onSubmit={saveProfile}>
                <label>Current headline<input name="headline" defaultValue={overview?.profile?.headline ?? ""} placeholder="Senior frontend engineer building real-time products" /></label>
                <div><label>Location<input name="location" defaultValue={overview?.profile?.location ?? ""} placeholder="Bengaluru, India" /></label><label>Work preference<select name="workMode" defaultValue={overview?.profile?.workMode ?? "flexible"}><option value="flexible">Flexible</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label></div>
                <div><label>Years of experience<input name="yearsExperience" type="number" min="0" max="60" defaultValue={overview?.profile?.yearsExperience ?? ""} /></label><label>Core skills<input name="skills" defaultValue={overview?.profile?.skills.join(", ") ?? ""} placeholder="React, TypeScript, real-time UI" /></label></div>
                <label>Strongest evidence<textarea name="strengths" defaultValue={overview?.profile?.strengths ?? ""} placeholder="Projects, decisions, and outcomes you can defend" /></label>
                <label>Constraints<textarea name="constraints" defaultValue={overview?.profile?.constraints ?? ""} placeholder="Location, notice period, role boundaries, or non-negotiables" /></label>
                <button disabled={working === "profile"} type="submit">{working === "profile" ? "Saving…" : "Save career profile"}</button>
              </form>
            </details>
          </article>
          <article className={styles.contextPanel}>
            <div><span>02 · TARGET</span><h3>{overview?.targetRoles.find((target) => target.isPrimary)?.title ?? "Primary target role"}</h3><p>{overview?.targetRoles.find((target) => target.isPrimary) ? `${overview.targetRoles.find((target) => target.isPrimary)!.seniority} · ${overview.targetRoles.find((target) => target.isPrimary)!.workMode}` : "A target keeps research, materials, and practice coherent."}</p></div>
            <details open={Boolean(overview?.profile && !overview.targetRoles.length)}>
              <summary>{overview?.targetRoles.length ? "Add another target" : "Define target role"}</summary>
              <form key={overview?.profile?.updatedAt ?? "new-target"} onSubmit={addTarget}>
                <label>Role title<input name="title" required placeholder="Senior frontend engineer" /></label>
                <div><label>Seniority<select name="seniority" defaultValue="senior"><option value="internship">Internship</option><option value="junior">Junior</option><option value="mid">Mid</option><option value="senior">Senior</option><option value="lead">Lead</option><option value="staff">Staff</option><option value="executive">Executive</option><option value="unspecified">Unspecified</option></select></label><label>Work mode<select name="workMode" defaultValue={overview?.profile?.workMode ?? "flexible"}><option value="flexible">Flexible</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></label></div>
                <label>Target location<input name="location" defaultValue={overview?.profile?.location ?? ""} /></label><label>Must-have skills<input name="mustHaveSkills" placeholder="React, design systems, people leadership" /></label><label>Notes<textarea name="notes" placeholder="Scope, company stage, industry, compensation, or exclusions" /></label>
                <button disabled={working === "target" || !overview?.profile} type="submit">{working === "target" ? "Saving…" : "Set primary target"}</button>
              </form>
            </details>
          </article>
          <article className={`${styles.contextPanel} ${styles.pipelinePanel}`} id="application-pipeline">
            <div><span>03 · PIPELINE</span><h3>Applications and next actions</h3><p>Records here are private planning state. ForgeFit never claims an external submission.</p></div>
            <form className={styles.quickApplication} onSubmit={addApplication}><input name="company" required placeholder="Company" /><input name="roleTitle" required placeholder="Role title" /><input name="sourceUrl" type="url" placeholder="https://job-link.example" /><input name="notes" placeholder="Why this role or what to verify" /><button disabled={working === "application"} type="submit">{working === "application" ? "Saving…" : "Save opportunity"}</button></form>
            <div className={styles.applicationList}>{overview?.recentApplications.length ? overview.recentApplications.map((application) => <div key={application.id}><span><b>{application.roleTitle}</b><small>{application.company} · {application.status}</small></span><select aria-label={`Update ${application.roleTitle} status`} disabled={working === application.id || !applicationTransitions[application.status].length} value={application.status} onChange={(event) => void updateApplicationStatus(application, event.target.value as CareerApplicationStatus)}><option value={application.status}>{application.status}</option>{applicationTransitions[application.status].map((status) => <option value={status} key={status}>Move to {status}</option>)}</select></div>) : <p>No saved opportunities yet. Use verified research in your coach, then record only the roles you want to pursue.</p>}</div>
          </article>
          <article className={`${styles.contextPanel} ${styles.feedbackPanel}`}>
            <div><span>04 · PRACTICE</span><h3>Interview evidence</h3><p>{overview?.progress.averageInterviewScore ? `Average grounded score ${overview.progress.averageInterviewScore}/5 across ${overview.progress.completedInterviews} practices.` : "Complete a practice to build an evidence-backed feedback baseline."}</p></div>
            {overview?.activeInterview && coach ? <Link href={workspaceHref(coach, journey[3].prompt, overview.activeInterview.id)}>Resume active practice →</Link> : <button disabled={!coachReady || !overview?.profile || !overview.targetRoles.length || working === "interview"} onClick={() => void startInterviewPractice()} type="button">{working === "interview" ? "Starting…" : "Start recorded practice"}</button>}
            {overview?.recentInterviews.find((session) => session.feedback)?.feedback && <blockquote><p>{overview.recentInterviews.find((session) => session.feedback)!.feedback!.summary}</p><small>{overview.recentInterviews.find((session) => session.feedback)!.feedback!.groundedEvidenceCount} grounded excerpts · {overview.recentInterviews.find((session) => session.feedback)!.feedback!.overallScore}/5</small></blockquote>}
          </article>
        </div>}
      </section>

      <section className={styles.journey} id="journey" aria-labelledby="journey-title">
        <header>
          <div><p className={styles.eyebrow}><span /> Your readiness loop</p><h2 id="journey-title">Four stages. <em>One continuous context.</em></h2></div>
          <p>Your coach carries the relevant conversation and files forward. You decide what gets shared and nothing is submitted on your behalf.</p>
        </header>
        <div className={styles.journeyGrid}>
          {journey.map((step) => (
            <article key={step.number}>
              <div><span>{step.number}</span><small>{step.stage}</small></div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
              {step.stage === "Interview" && coachReady && coach ? (
                overview?.activeInterview
                  ? <Link href={workspaceHref(coach, step.prompt, overview.activeInterview.id)}>Resume active practice <span>↗</span></Link>
                  : <button disabled={!overview?.profile || !overview.targetRoles.length || working === "interview"} onClick={() => void startInterviewPractice()} type="button">{step.action} <span>↗</span></button>
              ) : coachReady && coach ? (
                <Link href={workspaceHref(coach, step.prompt)}>{step.action} <span>↗</span></Link>
              ) : (
                <span className={styles.pendingAction}>{coach ? "Activate your coach to begin" : "Create your coach to begin"}</span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.capabilities} aria-labelledby="career-live-title">
        <div>
          <p className={styles.eyebrow}><span /> Available now</p>
          <h2 id="career-live-title">Built around evidence, <em>not invented confidence.</em></h2>
          <p>The current product keeps useful work together while staying explicit about where you remain in control.</p>
        </div>
        <ul>
          <li><b>Current opportunity research</b><span>Dated web evidence and direct employer or canonical ATS links.</span></li>
          <li><b>Resume and LinkedIn review</b><span>PDFs, screenshots, and truthful replacement wording grounded in your files.</span></li>
          <li><b>Repository evidence</b><span>Opt-in, filtered read-only code review when the local backend is configured.</span></li>
          <li><b>Live interview practice</b><span>Natural voice, interruption, persistent transcripts, and focused follow-ups.</span></li>
        </ul>
        <aside>
          <b>You stay in control</b>
          <p>Career Readiness prepares applications but does not open, fill, or submit external forms. A LinkedIn URL alone does not grant profile access.</p>
        </aside>
      </section>

      {careerBots.length > 1 && (
        <section className={styles.existing} aria-labelledby="existing-career-title">
          <div><p className={styles.eyebrow}><span /> Existing workspaces</p><h2 id="existing-career-title">Your career coaches</h2></div>
          <div>
            {careerBots.map((bot) => (
              <Link href={bot.status === "active" ? `/studio/bots/${bot.id}?from=career` : `/studio?bot=${bot.id}`} key={bot.id}>
                <span>{bot.vertical === "interview" ? "◎" : "▤"}</span>
                <p><b>{bot.name}</b><small>{bot.description}</small></p>
                <em>{bot.status === "active" ? "Open →" : "Finish setup →"}</em>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <Link href="/career"><b>CAREER</b><span>READINESS</span></Link>
        <p>Your evidence stays yours. You decide what moves forward.</p>
        <nav><Link href="/fitness">FitAI Coach</Link><Link href="/signout">Sign out</Link></nav>
      </footer>
    </main>
  );
}
