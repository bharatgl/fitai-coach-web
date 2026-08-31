"use client";

import type {
  BotChatHistoryResponse,
  BotChatMessage,
  BotChatResponse,
  BotDefinition,
  BotResponse,
  BotResearchEvidence,
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

function ResearchEvidence({ evidence }: { evidence: BotResearchEvidence }) {
  return (
    <section className={styles.researchEvidence} aria-label="Live research evidence">
      <header>
        <span>LIVE MARKET RESEARCH</span>
        <time dateTime={evidence.asOf}>As of {new Date(evidence.asOf).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
      </header>
      <div>
        {evidence.sources.map((source, index) => (
          <a href={source.url} target="_blank" rel="noreferrer" key={`${source.url}-${index}`}>
            <i>{index + 1}</i><span><b>{source.title}</b><small>{sourceHostname(source.url)}</small></span><em>↗</em>
          </a>
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
      <p>Current web evidence—not a guarantee. Verify compensation against role, level, location, and offer structure.</p>
    </section>
  );
}

export function SpecialistWorkspace({ botId, user }: { botId: string; user: CurrentUser }) {
  const [bot, setBot] = useState<BotDefinition | null>(null);
  const [messages, setMessages] = useState<BotChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [liveActivity, setLiveActivity] = useState<BotVoiceActivity | null>(null);
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
    const frame = window.requestAnimationFrame(() => {
      if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [liveActivity?.botCaption, liveActivity?.state, liveActivity?.userCaption, messages.length, sending]);

  function chooseStarter(prompt: string) {
    setDraft(prompt);
    window.requestAnimationFrame(() => composerRef.current?.focus());
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
    setSending(true);
    setError("");
    setTransferStatus(pendingAttachments.length
      ? `Uploading ${pendingAttachments.length === 1 ? pendingAttachments[0].file.name : `${pendingAttachments.length} files`}…`
      : "");
    let optimisticId: string | null = null;
    try {
      const uploads = await Promise.all(pendingAttachments.map(uploadAttachment));
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
      setDraft("");
      setPendingAttachments([]);
    } catch (cause) {
      if (optimisticId) setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setError(cause instanceof Error ? cause.message : "The specialist could not respond.");
    } finally {
      setSending(false);
      setTransferStatus("");
    }
  }

  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  if (loading) return <main className={styles.loading}>Opening your specialist…</main>;
  if (!bot) return <main className={styles.loading}><p>{error || "Specialist not found."}</p><Link href="/studio">Back to Forge Studio</Link></main>;
  const conversationStarted = messages.length > 0 || Boolean(liveActivity?.userCaption || liveActivity?.botCaption);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="forgefit.space home"><BrandLockup /></Link>
        <span>Private {bot.vertical} practice workspace</span>
        <nav><Link href="/studio/operations">Operations</Link><Link href="/studio">Forge Studio</Link><b>{initials}</b></nav>
      </header>
      <div className={styles.shell}>
        <section className={styles.conversation} aria-label={`${bot.name} conversation`}>
          <header className={styles.chatHeader}>
            <div><i aria-hidden="true">{bot.vertical === "interview" ? "◎" : bot.vertical === "resume" ? "▤" : bot.vertical === "fitness" ? "ϟ" : "✦"}</i><span><small>{bot.vertical} specialist</small><b>{bot.name}</b><em>{bot.description}</em></span></div>
            <div className={styles.chatMeta}><span data-active={bot.status === "active"}>{bot.status}</span><strong>{messages.length} {messages.length === 1 ? "message" : "messages"}</strong><Link href="/studio">Edit bot</Link></div>
          </header>
          <BotVoicePanel
            bot={bot}
            variant="workspace"
            showTranscript={false}
            onActivityChange={handleVoiceActivity}
            onMessageCreated={(message) => setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])}
          />
          <div className={`${styles.messages} ${!conversationStarted ? styles.emptyMessages : ""}`} ref={messagesRef}>
            {!conversationStarted && (
              <div className={styles.starter}>
                <div><span /><span /><b>{bot.name.slice(0, 2).toUpperCase()}</b></div>
                <span>YOUR PRIVATE SPECIALIST</span>
                <h2>What would you like to practise?</h2>
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
                  {message.research && <ResearchEvidence evidence={message.research} />}
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
              <button type="button" disabled={sending || !bot.capabilities.documentReview || pendingAttachments.length >= maxAttachments} onClick={() => attachmentInputRef.current?.click()} title={bot.capabilities.documentReview ? "Attach PDF or image (up to 5 MB)" : "Enable document review in Forge Studio"}>
                <AttachmentIcon /><span>Attach</span>
              </button>
              <button type="button" disabled={sending} onClick={() => { setDraft("Create a polished PDF document from our work so far."); composerRef.current?.focus(); }}>
                <span>↧</span><span>Create PDF</span>
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
