"use client";

import type {
  BotChatHistoryResponse,
  BotChatMessage,
  BotChatResponse,
  BotDefinition,
  BotLocalRepositoryConnectionResponse,
  BotResponse,
  BotResearchEvidence,
  CareerInterviewResponse,
  CareerInterviewSession,
  CareerInterviewTurn,
  CoachAttachment,
  UploadCoachAttachmentResponse,
} from "@fitai/contracts";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { BotVoicePanel, type BotVoiceActivity } from "@/components/BotStudio";
import { ConversationMessageContent } from "@/components/CoachMessageContent";
import { apiRequest } from "@/lib/api";
import styles from "./SpecialistWorkspace.module.css";

type CurrentUser = { id: string; name: string; email: string };
type AttachmentMimeType = CoachAttachment["mimeType"];
type PendingAttachment = { key: string; file: File; mimeType: AttachmentMimeType };
const attachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxAttachmentBytes = 5 * 1024 * 1024;
const maxAttachments = 3;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      if (commaIndex < 0) reject(new Error(`Unable to read ${file.name}`));
      else resolve(result.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatAttachmentSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function sourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web source";
  }
}

function attachmentMimeType(file: File): AttachmentMimeType | null {
  if (attachmentTypes.has(file.type)) return file.type as AttachmentMimeType;
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

function AttachmentIcon({ remove = false }: { remove?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {remove
        ? <path d="m7 7 10 10M17 7 7 17" />
        : <path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4.25 4.25 0 0 1 6 6l-9.6 9.6a2.5 2.5 0 0 1-3.5-3.5l8.8-8.8" />}
    </svg>
  );
}

function MessageAttachments({ botId, attachments }: { botId: string; attachments: CoachAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className={styles.messageAttachments}>
      {attachments.map((attachment) => (
        <a href={`/api/backend/bots/${botId}/attachments/${attachment.id}`} target="_blank" rel="noreferrer" key={attachment.id}>
          <span>{attachment.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
          <b>{attachment.name}</b>
          <small>{formatAttachmentSize(attachment.size)} · Open ↗</small>
        </a>
      ))}
    </div>
  );
}

function ResearchEvidence({
  evidence,
  onPrepareApplication,
}: {
  evidence: BotResearchEvidence;
  onPrepareApplication: (source: BotResearchEvidence["sources"][number]) => void;
}) {
  const jobMatches = evidence.kind === "jobs";
  const displayedSources = jobMatches && evidence.applicationSources?.length
    ? evidence.applicationSources
    : evidence.sources;
  return (
    <section className={styles.researchEvidence} aria-label={jobMatches ? "Current job matches" : "Live research evidence"}>
      <header>
        <span>{jobMatches ? "CURRENT JOB MATCHES" : "LIVE MARKET RESEARCH"}</span>
        <time dateTime={evidence.asOf}>As of {new Date(evidence.asOf).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
      </header>
      <div>
        {displayedSources.map((source, index) => (
          <div className={styles.researchSource} key={`${source.url}-${index}`}>
            <a href={source.url} target="_blank" rel="noreferrer">
              <i>{index + 1}</i><span><b>{source.title}</b><small>{sourceHostname(source.url)}</small></span><em>{jobMatches ? "View / apply ↗" : "↗"}</em>
            </a>
            {jobMatches && (
              <button type="button" onClick={() => onPrepareApplication(source)}>
                Prepare application
              </button>
            )}
          </div>
        ))}
      </div>
      {evidence.searchSuggestionsHtml && (
        <iframe
          className={styles.searchSuggestions}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={evidence.searchSuggestionsHtml}
          title="Google Search suggestions"
        />
      )}
      <p>{jobMatches
        ? "Direct employer or ATS listings checked against current web evidence. Openings can still change without notice—review the page before applying."
        : "Current web evidence—not a guarantee. Verify compensation against role, level, location, and offer structure."}</p>
    </section>
  );
}

export function SpecialistWorkspace({
  botId,
  user,
  initialPrompt = "",
  entry = "studio",
  careerSessionId,
}: {
  botId: string;
  user: CurrentUser;
  initialPrompt?: string;
  entry?: "career" | "studio";
  careerSessionId?: string;
}) {
  const [bot, setBot] = useState<BotDefinition | null>(null);
  const [messages, setMessages] = useState<BotChatMessage[]>([]);
  const [draft, setDraft] = useState(initialPrompt);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [liveActivity, setLiveActivity] = useState<BotVoiceActivity | null>(null);
  const [repository, setRepository] = useState<BotLocalRepositoryConnectionResponse | null>(null);
  const [showRepositoryAccess, setShowRepositoryAccess] = useState(false);
  const [repositoryBusy, setRepositoryBusy] = useState(false);
  const [practiceSession, setPracticeSession] = useState<CareerInterviewSession | null>(null);
  const [practiceBusy, setPracticeBusy] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const handleVoiceActivity = useCallback((activity: BotVoiceActivity) => {
    setLiveActivity(activity);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<BotResponse>(`/v1/bots/${botId}`),
      apiRequest<BotChatHistoryResponse>(`/v1/bots/${botId}/messages`),
    ]).then(([botResult, history]) => {
      if (!active) return;
      setBot(botResult.bot);
      setMessages(history.messages);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to open this specialist.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [botId, user.id]);

  useEffect(() => {
    if (!careerSessionId) return;
    const controller = new AbortController();
    void apiRequest<CareerInterviewResponse>(`/v1/career/interviews/${careerSessionId}`, {
      signal: controller.signal,
    }).then((response) => setPracticeSession(response.session)).catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Unable to open this recorded practice.");
      }
    });
    return () => controller.abort();
  }, [careerSessionId, user.id]);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<BotLocalRepositoryConnectionResponse>(`/v1/bots/${botId}/local-repository`, {
      signal: controller.signal,
    }).then(setRepository).catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Unable to check local repository access.");
      }
    });
    return () => controller.abort();
  }, [botId, user.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [liveActivity?.botCaption, liveActivity?.state, liveActivity?.userCaption, messages, sending]);

  function chooseStarter(prompt: string) {
    setDraft(prompt);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function prepareApplication(source: BotResearchEvidence["sources"][number]) {
    setDraft(`Help me prepare a truthful application for "${source.title}" (${source.url}). Verify the role details, compare them with my resume and our conversation, then give me tailored resume changes, a concise cover note, and field-by-field answers for common application questions. Do not submit anything without my confirmation.`);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  function startLinkedInReview() {
    setDraft("Review and optimize my LinkedIn profile for my target roles. Use the attached LinkedIn PDF or screenshots to audit my headline, About section, experience, skills, Featured section, recruiter-search keywords, and credibility. Give me prioritized fixes and exact truthful replacement wording.");
    attachmentInputRef.current?.click();
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function enableRepositoryAccess() {
    setRepositoryBusy(true);
    setError("");
    try {
      const next = await apiRequest<BotLocalRepositoryConnectionResponse>(`/v1/bots/${botId}/local-repository`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      setRepository(next);
      setShowRepositoryAccess(false);
      setDraft("Inspect the connected local repository and turn the strongest implementation evidence into truthful resume bullets.");
      window.requestAnimationFrame(() => composerRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to enable local repository access.");
    } finally {
      setRepositoryBusy(false);
    }
  }

  async function disableRepositoryAccess() {
    setRepositoryBusy(true);
    setError("");
    try {
      const next = await apiRequest<BotLocalRepositoryConnectionResponse>(`/v1/bots/${botId}/local-repository`, {
        method: "DELETE",
      });
      setRepository(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to disable local repository access.");
    } finally {
      setRepositoryBusy(false);
    }
  }

  function selectAttachments(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const normalized = selected.map((file) => ({ file, mimeType: attachmentMimeType(file) }));
    const invalid = normalized.find((attachment) => !attachment.mimeType);
    if (invalid) {
      setError(`${invalid.file.name} is not supported. Attach a PDF, JPEG, PNG, or WebP file.`);
      return;
    }
    const oversized = selected.find((file) => file.size > maxAttachmentBytes);
    if (oversized) {
      setError(`${oversized.name} is larger than the 5 MB limit.`);
      return;
    }
    const available = maxAttachments - pendingAttachments.length;
    if (available <= 0) {
      setError("You can attach up to 3 files to one message.");
      return;
    }
    setPendingAttachments((current) => [
      ...current,
      ...normalized.slice(0, available).map(({ file, mimeType }) => ({
        key: crypto.randomUUID(),
        file,
        mimeType: mimeType!,
      })),
    ]);
    setError(selected.length > available ? "Only the first 3 files were added." : "");
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function uploadAttachment(attachment: PendingAttachment) {
    return apiRequest<UploadCoachAttachmentResponse>(`/v1/bots/${botId}/attachments`, {
      method: "POST",
      body: JSON.stringify({
        name: attachment.file.name,
        mimeType: attachment.mimeType,
        dataBase64: await fileToBase64(attachment.file),
      }),
    });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if ((!content && !pendingAttachments.length) || sending || !bot) return;
    const submittedAttachments = pendingAttachments;
    setSending(true);
    setError("");
    setDraft("");
    setPendingAttachments([]);
    setTransferStatus(submittedAttachments.length
      ? `Uploading ${submittedAttachments.length === 1 ? submittedAttachments[0].file.name : `${submittedAttachments.length} files`}…`
      : "");
    let optimisticId: string | null = null;
    try {
      const uploads = await Promise.all(submittedAttachments.map(uploadAttachment));
      const attachments = uploads.map((upload) => upload.attachment);
      setTransferStatus(attachments.length ? `${bot.name} is reading the attachment…` : "");
      optimisticId = `pending-${crypto.randomUUID()}`;
      setMessages((current) => [...current, {
        id: optimisticId!,
        botId: bot.id,
        role: "user",
        content: content || `Shared ${attachments[0]?.name ?? "an attachment"}`,
        attachments,
        research: null,
        createdAt: new Date().toISOString(),
      }]);
      const response = await apiRequest<BotChatResponse>(`/v1/bots/${bot.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          message: content,
          attachmentIds: attachments.map((attachment) => attachment.id),
        }),
      });
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        response.userMessage,
        response.message,
      ]);
    } catch (cause) {
      if (optimisticId) setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setDraft((current) => current.trim() ? current : content);
      setPendingAttachments((current) => current.length ? current : submittedAttachments);
      setError(cause instanceof Error ? cause.message : "The specialist could not respond.");
    } finally {
      setSending(false);
      setTransferStatus("");
    }
  }

  function practiceTurns(): CareerInterviewTurn[] {
    if (!practiceSession) return [];
    const startedAt = new Date(practiceSession.startedAt).getTime();
    return messages
      .filter((message) => !message.id.startsWith("pending-") && new Date(message.createdAt).getTime() >= startedAt)
      .map<CareerInterviewTurn>((message) => ({ role: message.role === "assistant" ? "coach" : "user", content: message.content.trim().slice(0, 4_000) }))
      .filter((turn) => turn.content)
      .slice(-100);
  }

  async function finishPractice() {
    if (!practiceSession || practiceSession.status !== "active" || practiceBusy) return;
    const turns = practiceTurns();
    if (!turns.some((turn) => turn.role === "user") || turns.length < 2) {
      setError("Answer at least one interview question before requesting feedback.");
      return;
    }
    setPracticeBusy(true);
    setError("");
    try {
      const response = await apiRequest<CareerInterviewResponse>(`/v1/career/interviews/${practiceSession.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ turns }),
      });
      setPracticeSession(response.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Feedback could not be generated.");
    } finally {
      setPracticeBusy(false);
    }
  }

  async function abandonPractice() {
    if (!practiceSession || practiceSession.status !== "active" || practiceBusy) return;
    setPracticeBusy(true);
    setError("");
    try {
      const response = await apiRequest<CareerInterviewResponse>(`/v1/career/interviews/${practiceSession.id}/abandon`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPracticeSession(response.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Practice could not be ended.");
    } finally {
      setPracticeBusy(false);
    }
  }

  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  if (loading) return <main className={styles.loading}>Opening your specialist…</main>;
  if (!bot) return <main className={styles.loading}><p>{error || "Agent not found."}</p><Link href="/studio">Back to Agent Studio</Link></main>;
  const conversationStarted = messages.length > 0 || Boolean(liveActivity?.userCaption || liveActivity?.botCaption);
  const careerWorkspace = entry === "career" || bot.vertical === "interview" || bot.vertical === "resume";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="forgefit.space home"><BrandLockup /></Link>
        <span>{careerWorkspace ? "Career Readiness · private workspace" : `Private ${bot.vertical} practice workspace`}</span>
        <nav>{careerWorkspace && <Link href="/career">Career journey</Link>}<Link href="/studio">Advanced Studio</Link><b>{initials}</b></nav>
      </header>
      <div className={styles.shell}>
        <section className={styles.conversation} aria-label={`${bot.name} conversation`}>
          <header className={styles.chatHeader}>
            <div className={styles.chatIdentity}><i aria-hidden="true">{bot.vertical === "interview" ? "◎" : bot.vertical === "resume" ? "▤" : bot.vertical === "fitness" ? "ϟ" : "✦"}</i><span><small>{bot.vertical} specialist</small><b>{bot.name}</b><em>{bot.description}</em></span></div>
            <div className={styles.chatActions}>
              <div className={styles.chatMeta}><span data-active={bot.status === "active"}>{bot.status}</span><strong>{messages.length} {messages.length === 1 ? "message" : "messages"}</strong><Link href="/studio">Advanced settings</Link></div>
              <BotVoicePanel
                bot={bot}
                variant="workspace"
                showTranscript={false}
                onActivityChange={handleVoiceActivity}
                onMessageCreated={(message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])}
              />
            </div>
          </header>
          {practiceSession && (
            <section className={styles.practiceBar} data-status={practiceSession.status} aria-live="polite">
              {practiceSession.status === "active" ? (
                <>
                  <div><span>RECORDED PRACTICE</span><b>{practiceSession.format.replace("_", " ")} interview in progress</b><small>Only messages from this session are evaluated. Feedback cites your actual answers.</small></div>
                  <div><button disabled={practiceBusy} onClick={() => void abandonPractice()} type="button">End without feedback</button><button disabled={practiceBusy} onClick={() => void finishPractice()} type="button">{practiceBusy ? "Evaluating…" : "Finish & get feedback"}</button></div>
                </>
              ) : practiceSession.feedback ? (
                <div className={styles.practiceFeedback}>
                  <span>PRACTICE COMPLETE · {practiceSession.feedback.overallScore}/5</span>
                  <b>{practiceSession.feedback.summary}</b>
                  <ul>{practiceSession.feedback.rubric.map((item) => <li key={item.competency}><strong>{item.competency} · {item.score}/5</strong><p>{item.feedback}</p>{item.evidenceExcerpt && <q>{item.evidenceExcerpt}</q>}</li>)}</ul>
                  <footer><small>{practiceSession.feedback.groundedEvidenceCount} grounded excerpts</small><Link href="/career">Return to career plan →</Link></footer>
                </div>
              ) : (
                <div><span>PRACTICE ENDED</span><b>This session was not evaluated.</b><Link href="/career">Return to career plan →</Link></div>
              )}
            </section>
          )}
          <div className={`${styles.messages} ${!conversationStarted ? styles.emptyMessages : ""}`} ref={messagesRef}>
            {!conversationStarted && (
              <div className={styles.starter}>
                <div><span /><span /><b>{bot.name.slice(0, 2).toUpperCase()}</b></div>
                <span>YOUR PRIVATE SPECIALIST</span>
                <h2>{careerWorkspace ? "Where are you in the journey?" : "What would you like to practise?"}</h2>
                <p>{bot.instructions.firstMessage}</p>
                <div className={styles.starterGrid}>
                  {bot.starterPrompts.map((prompt, index) => (
                    <button key={prompt} onClick={() => chooseStarter(prompt)} type="button">
                      <i>{String(index + 1).padStart(2, "0")}</i><span>{prompt}</span><b>→</b>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article className={message.role === "user" ? styles.mine : styles.theirs} key={message.id}>
                <i>{message.role === "user" ? "YOU" : "✦"}</i>
                <div>
                  {message.role === "assistant"
                    ? <ConversationMessageContent content={message.content} />
                    : <p>{message.content}</p>}
                  <MessageAttachments botId={bot.id} attachments={message.attachments ?? []} />
                  {message.research && <ResearchEvidence evidence={message.research} onPrepareApplication={prepareApplication} />}
                  <small>{message.id.startsWith("pending-") ? "Sending…" : new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                </div>
              </article>
            ))}
            {liveActivity?.userCaption && (
              <article className={`${styles.mine} ${styles.liveMessage}`} aria-live="polite">
                <i>YOU</i>
                <div><p>{liveActivity.userCaption}</p><small>Live transcript</small></div>
              </article>
            )}
            {liveActivity?.botCaption && (
              <article className={`${styles.theirs} ${styles.liveMessage}`} aria-live="polite">
                <i>✦</i>
                <div><ConversationMessageContent content={liveActivity.botCaption} /><small>{bot.name} · live</small></div>
              </article>
            )}
            {liveActivity && (liveActivity.state === "connecting" || liveActivity.state === "listening") && !liveActivity.userCaption && !liveActivity.botCaption && (
              <div className={styles.liveListening} role="status"><i /><span>{liveActivity.state === "connecting" ? "Connecting live voice…" : "Listening…"}</span></div>
            )}
            {sending && <div className={styles.thinking} role="status"><i /><i /><i /><span>{bot.name} is thinking</span></div>}
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <form className={styles.composer} onSubmit={send}>
            {showRepositoryAccess && (
              <section className={styles.repositoryAccess} aria-label="Local repository access">
                <div>
                  <span aria-hidden="true">⌘</span>
                  <p>
                    <b>{repository?.repository ? repository.repository.name : "Local workspace"}</b>
                    <small>{repository?.repository
                      ? "Read-only access is enabled. Source files are filtered and secrets, dependencies, build output, and Git internals are excluded."
                      : repository?.available
                        ? "Allow this bot to inspect a filtered, read-only snapshot of the current local repository."
                        : "The backend cannot find a local workspace. Configure LOCAL_REPOSITORY_ROOT and restart it."}</small>
                  </p>
                </div>
                {repository?.repository ? (
                  <button type="button" disabled={repositoryBusy} onClick={() => void disableRepositoryAccess()}>
                    {repositoryBusy ? "Disabling…" : "Disable access"}
                  </button>
                ) : (
                  <button type="button" disabled={repositoryBusy || repository?.available === false} onClick={() => void enableRepositoryAccess()}>
                    {repositoryBusy ? "Enabling…" : "Enable read-only access"}
                  </button>
                )}
              </section>
            )}
            {pendingAttachments.length > 0 && (
              <div className={styles.pendingAttachments} aria-label="Selected attachments">
                {pendingAttachments.map((attachment) => (
                  <div key={attachment.key}>
                    <span>{attachment.mimeType === "application/pdf" ? "PDF" : "IMG"}</span>
                    <p><b>{attachment.file.name}</b><small>Ready to send · {formatAttachmentSize(attachment.file.size)}</small></p>
                    <button type="button" onClick={() => setPendingAttachments((current) => current.filter((item) => item.key !== attachment.key))} aria-label={`Remove ${attachment.file.name}`}><AttachmentIcon remove /></button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={attachmentInputRef}
              className={styles.visuallyHidden}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp,application/pdf"
              multiple
              onChange={(event) => {
                selectAttachments(event.target.files);
                event.target.value = "";
              }}
            />
            <label className={styles.visuallyHidden} htmlFor="specialist-message">Message {bot.name}</label>
            <textarea
              id="specialist-message"
              ref={composerRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`Message ${bot.name}…`}
            />
            <button className={styles.sendButton} disabled={sending || (!draft.trim() && !pendingAttachments.length) || bot.status !== "active"} type="submit" aria-label="Send message">{sending ? "•••" : "↑"}</button>
            <div className={styles.composerTools}>
              <button type="button" disabled={sending || !bot.capabilities.documentReview || pendingAttachments.length >= maxAttachments} onClick={() => attachmentInputRef.current?.click()} title={bot.capabilities.documentReview ? "Attach PDF or image (up to 5 MB)" : "Enable document review in Agent Studio"}>
                <AttachmentIcon /><span>Attach</span>
              </button>
              <button type="button" disabled={sending} onClick={() => { setDraft("Create a polished PDF document from our work so far."); composerRef.current?.focus(); }}>
                <span>↧</span><span>Create PDF</span>
              </button>
              {(bot.vertical === "interview" || bot.vertical === "resume") && bot.capabilities.webResearch && (
                <button type="button" disabled={sending} onClick={() => { setDraft("Find current jobs that match my experience, target seniority, and location or remote preference. Return only verified active listings with direct employer or canonical ATS application links."); composerRef.current?.focus(); }}>
                  <span>⌕</span><span>Find jobs</span>
                </button>
              )}
              {(bot.vertical === "interview" || bot.vertical === "resume") && bot.capabilities.documentReview && (
                <button type="button" disabled={sending || pendingAttachments.length >= maxAttachments} onClick={startLinkedInReview}>
                  <span>in</span><span>Review LinkedIn</span>
                </button>
              )}
              <button type="button" disabled={sending} data-active={Boolean(repository?.repository)} onClick={() => setShowRepositoryAccess((current) => !current)}>
                <span>⌘</span><span>{repository?.repository ? `Repo: ${repository.repository.name}` : "Repository"}</span>
              </button>
              <small><b>✦</b> Enter to send · Shift + Enter for a new line</small>
            </div>
            {(pendingAttachments.length > 0 || transferStatus) && (
              <p className={styles.attachmentStatus} role="status">
                {transferStatus || `${pendingAttachments.length === 1 ? "File attached" : `${pendingAttachments.length} files attached`} — press Send ↑ to share ${pendingAttachments.length === 1 ? "it" : "them"} with ${bot.name}.`}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
