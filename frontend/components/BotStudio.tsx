"use client";

import type {
  BotChatMessage,
  BotChatResponse,
  BotDefinition,
  BotGeneratedPdfResponse,
  BotLiveTokenResponse,
  BotListResponse,
  BotResponse,
  BotResearchResponse,
  BotTemplate,
  BotTemplateListResponse,
  BotVoiceSessionResponse,
  LiveAttachmentReviewResponse,
  SaveLiveBotTurnRequest,
  UpdateBotRequest,
} from "@fitai/contracts";
import type { Conversation as ElevenLabsConversation } from "@elevenlabs/client";
import { Button, Field, StatusBadge } from "@fitai/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";
import { decodeLiveServerMessage } from "@/lib/live-voice";
import styles from "./BotStudio.module.css";

type CurrentUser = { id: string; name: string; email: string };
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "paused" | "error";
export type BotVoiceActivity = {
  state: VoiceState;
  userCaption: string;
  botCaption: string;
};
type CreatorStep = "identity" | "context" | "behavior" | "voice";
type StudioLiveMessage = {
  setupComplete?: Record<string, never>;
  goAway?: { timeLeft?: string };
  sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  };
  toolCall?: { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> };
};

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodePcm(data: string) {
  const binary = atob(data);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) view.setUint8(index, binary.charCodeAt(index));
  const samples = new Float32Array(Math.floor(binary.length / 2));
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

function pcmSampleRate(mimeType = "") {
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24_000;
}

function draftFromBot(bot: BotDefinition): UpdateBotRequest {
  return {
    name: bot.name,
    description: bot.description,
    instructions: structuredClone(bot.instructions),
    context: structuredClone(bot.context),
    voice: structuredClone(bot.voice),
    capabilities: structuredClone(bot.capabilities),
    starterPrompts: [...bot.starterPrompts],
  };
}

function providerError(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 429) {
    const reset = error.retryAfterSeconds
      ? ` Try again in about ${Math.max(1, Math.ceil(error.retryAfterSeconds / 60))} minutes.`
      : " Try again after your quota resets or update the configured credentials.";
    return `ElevenLabs voice quota is exhausted.${reset}`;
  }
  if (error instanceof ApiRequestError && error.status === 503) {
    return "ElevenLabs is not configured for this workspace yet. Your bot draft is saved; add a platform or personal ElevenLabs key before activation.";
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function BotVoicePanel({
  bot,
  variant = "studio",
  showTranscript = true,
  onActivityChange,
  onMessageCreated,
}: {
  bot: BotDefinition;
  variant?: "studio" | "workspace";
  showTranscript?: boolean;
  onActivityChange?: (activity: BotVoiceActivity) => void;
  onMessageCreated?: (message: BotChatMessage) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [providerNote, setProviderNote] = useState("");
  const [provider, setProvider] = useState<"ElevenLabs" | "Gemini Live">("Gemini Live");
  const [userCaption, setUserCaption] = useState("");
  const [botCaption, setBotCaption] = useState("");
  const [persistenceIssue, setPersistenceIssue] = useState("");
  const conversationRef = useRef<ElevenLabsConversation | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const captureRef = useRef<AudioWorkletNode | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextPlaybackRef = useRef(0);
  const setupCompleteRef = useRef(false);
  const fallbackInProgressRef = useRef(false);
  const shouldRunRef = useRef(false);
  const resumptionHandleRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pausedRef = useRef(false);
  const userTurnRef = useRef("");
  const botTurnRef = useRef("");
  const turnSaveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    onActivityChange?.({ state, userCaption, botCaption });
  }, [botCaption, onActivityChange, state, userCaption]);

  const clearPlayback = useCallback(() => {
    for (const source of outputSourcesRef.current) {
      try { source.stop(); } catch { /* source already ended */ }
    }
    outputSourcesRef.current.clear();
    nextPlaybackRef.current = audioContextRef.current?.currentTime ?? 0;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const clearStableSessionTimer = useCallback(() => {
    if (stableSessionTimerRef.current) clearTimeout(stableSessionTimerRef.current);
    stableSessionTimerRef.current = null;
  }, []);

  const closeResources = useCallback(() => {
    clearReconnectTimer();
    clearStableSessionTimer();
    pausedRef.current = false;
    const conversation = conversationRef.current;
    conversationRef.current = null;
    if (conversation) void conversation.endSession().catch(() => undefined);
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "Preview ended");
    }
    setupCompleteRef.current = false;
    captureRef.current?.disconnect();
    captureSourceRef.current?.disconnect();
    captureRef.current = null;
    captureSourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearPlayback();
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }, [clearPlayback, clearReconnectTimer, clearStableSessionTimer]);

  useEffect(() => () => {
    shouldRunRef.current = false;
    closeResources();
  }, [bot.id, closeResources]);

  function playGeminiAudio(data: string, mimeType?: string) {
    if (pausedRef.current) return;
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state === "closed") return;
    const samples = decodePcm(data);
    if (!samples.length) return;
    const buffer = audioContext.createBuffer(1, samples.length, pcmSampleRate(mimeType));
    buffer.copyToChannel(samples, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const startAt = Math.max(audioContext.currentTime + 0.015, nextPlaybackRef.current);
    nextPlaybackRef.current = startAt + buffer.duration;
    outputSourcesRef.current.add(source);
    source.onended = () => {
      outputSourcesRef.current.delete(source);
      if (outputSourcesRef.current.size === 0 && !pausedRef.current) setState("listening");
    };
    source.start(startAt);
    setState("speaking");
  }

  async function connectGeminiCapture(stream: MediaStream, audioContext: AudioContext) {
    await audioContext.audioWorklet.addModule("/audio-worklets/pcm-capture.js");
    const source = audioContext.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(audioContext, "pcm-capture");
    const silent = audioContext.createGain();
    silent.gain.value = 0;
    source.connect(capture);
    capture.connect(silent);
    silent.connect(audioContext.destination);
    capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const socket = socketRef.current;
      if (!setupCompleteRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: { data: bytesToBase64(event.data), mimeType: "audio/pcm;rate=16000" },
        },
      }));
    };
    captureSourceRef.current = source;
    captureRef.current = capture;
  }

  async function reviewRecentAttachment(question: unknown) {
    return apiRequest<LiveAttachmentReviewResponse>(`/v1/bots/${bot.id}/live-attachment-review`, {
      method: "POST",
      body: JSON.stringify({
        question: typeof question === "string" && question.trim()
          ? question.trim()
          : "Review the most recently uploaded file and explain the important findings.",
      }),
    });
  }

  async function createPdfDocument(titleValue: unknown, contentValue: unknown) {
    const title = typeof titleValue === "string" && titleValue.trim()
      ? titleValue.trim()
      : `${bot.name} document`;
    const content = typeof contentValue === "string" ? contentValue.trim() : "";
    if (!content) throw new Error("Complete document content is required before creating the PDF.");
    const response = await apiRequest<BotGeneratedPdfResponse>(`/v1/bots/${bot.id}/generated-pdfs`, {
      method: "POST",
      body: JSON.stringify({ title, content }),
    });
    onMessageCreated?.(response.message);
    return {
      status: "created",
      name: response.attachment.name,
      message: "The PDF is ready and its download is visible in the chat.",
    };
  }

  async function researchCurrentMarket(questionValue: unknown) {
    const question = typeof questionValue === "string" && questionValue.trim()
      ? questionValue.trim()
      : "Research the current market and recent trends relevant to our conversation.";
    const response = await apiRequest<BotResearchResponse>(`/v1/bots/${bot.id}/research`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    onMessageCreated?.(response.message);
    return {
      answer: response.answer,
      asOf: response.evidence.asOf,
      sources: response.evidence.sources,
      instruction: "Use the numbered evidence in the answer. State uncertainty and do not invent additional current facts.",
    };
  }

  function saveCompletedVoiceTurn(voiceProvider: "gemini" | "elevenlabs") {
    const userTranscript = userTurnRef.current.trim();
    const assistantTranscript = botTurnRef.current.trim();
    userTurnRef.current = "";
    botTurnRef.current = "";
    if (!userTranscript || !assistantTranscript) return Promise.resolve();
    const turn: SaveLiveBotTurnRequest = {
      clientTurnId: crypto.randomUUID(),
      userTranscript,
      assistantTranscript,
      provider: voiceProvider,
    };
    const persist = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await apiRequest<BotChatResponse>(`/v1/bots/${bot.id}/live-turns`, {
            method: "POST",
            body: JSON.stringify(turn),
          });
          onMessageCreated?.(response.userMessage);
          onMessageCreated?.(response.message);
          setUserCaption("");
          setBotCaption("");
          setPersistenceIssue("");
          return;
        } catch {
          if (attempt === 0) continue;
          setPersistenceIssue("The conversation continued, but the latest voice turn could not be saved.");
        }
      }
    };
    const queued = turnSaveQueueRef.current.then(persist, persist);
    turnSaveQueueRef.current = queued;
    return queued;
  }

  async function answerToolCalls(
    calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>,
    socket: WebSocket,
  ) {
    const responses = await Promise.all(calls.map(async (call) => {
      if (call.name === "review_recent_attachment") {
        return {
          id: call.id,
          name: call.name,
          response: { result: await reviewRecentAttachment(call.args?.question) },
        };
      }
      if (call.name === "create_pdf_document") {
        return {
          id: call.id,
          name: call.name,
          response: { result: await createPdfDocument(call.args?.title, call.args?.content) },
        };
      }
      if (call.name === "research_current_market") {
        return {
          id: call.id,
          name: call.name,
          response: { result: await researchCurrentMarket(call.args?.question) },
        };
      }
      return { id: call.id, name: call.name, response: { result: "Unsupported tool" } };
    }));
    if (socketRef.current === socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    }
  }

  async function ensureGeminiMedia() {
    if (!window.AudioContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Live voice needs microphone and Web Audio support in this browser.");
    }
    let audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new window.AudioContext();
      audioContextRef.current = audioContext;
    }
    if (audioContext.state === "suspended") await audioContext.resume();
    let stream = streamRef.current;
    if (!stream || stream.getAudioTracks().every((track) => track.readyState === "ended")) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
    }
    return { audioContext, stream };
  }

  function retireGeminiSocket(socket: WebSocket, reason: string) {
    if (socketRef.current === socket) socketRef.current = null;
    setupCompleteRef.current = false;
    clearStableSessionTimer();
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState < WebSocket.CLOSING) socket.close(1000, reason);
  }

  function scheduleGeminiReconnect(reason: string) {
    if (!shouldRunRef.current || reconnectTimerRef.current) return;
    const attempt = reconnectAttemptRef.current + 1;
    if (attempt > 3) {
      void switchToElevenLabs(`${reason} Gemini Live could not reconnect after three attempts, so ElevenLabs is being tried as a fallback.`);
      return;
    }
    reconnectAttemptRef.current = attempt;
    setProvider("Gemini Live");
    setProviderNote(`Gemini Live is refreshing the connection automatically (${attempt}/3)…`);
    setError("");
    setState("connecting");
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectGemini(resumptionHandleRef.current).catch((cause) => {
        scheduleGeminiReconnect(cause instanceof Error ? cause.message : reason);
      });
    }, 500 * 2 ** (attempt - 1));
  }

  async function connectGemini(resumeHandle: string | null) {
    setProvider("Gemini Live");
    const credentials = await apiRequest<BotLiveTokenResponse>(`/v1/bots/${bot.id}/live-token`, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({}),
    });
    if (!shouldRunRef.current) return;
    const { audioContext, stream } = await ensureGeminiMedia();
    if (!shouldRunRef.current) return;
    const endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
    const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(credentials.token)}`);
    socket.binaryType = "arraybuffer";
    setupCompleteRef.current = false;
    socketRef.current = socket;
    socket.onopen = () => {
      if (!shouldRunRef.current || socketRef.current !== socket) return;
      socket.send(JSON.stringify({
        setup: {
          model: `models/${credentials.model.replace(/^models\//, "")}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: credentials.voiceName } },
            },
            thinkingConfig: { thinkingLevel: "MEDIUM" },
          },
          historyConfig: { initialHistoryInClientContent: true },
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{
            functionDeclarations: [
              {
                name: "review_recent_attachment",
                description: "Review the actual bytes of the most recently uploaded file in this bot conversation before answering questions about it.",
                parameters: {
                  type: "OBJECT",
                  properties: { question: { type: "STRING" } },
                  required: ["question"],
                },
              },
              {
                name: "create_pdf_document",
                description: "Create and attach a downloadable PDF when the user asks to generate, export, save, or download one.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    title: { type: "STRING" },
                    content: { type: "STRING", description: "The complete polished document content." },
                  },
                  required: ["title", "content"],
                },
              },
              ...(bot.capabilities.webResearch ? [{
                name: "research_current_market",
                description: "Search the current web for verifiable market values, salary ranges, hiring trends, company expectations, recent technology changes, or other time-sensitive facts before answering.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    question: { type: "STRING", description: "A specific research question including role, location, seniority, company, and time range when known." },
                  },
                  required: ["question"],
                },
              }] : []),
            ],
          }],
        },
      }));
    };
    socket.onmessage = (event) => {
      void decodeLiveServerMessage<StudioLiveMessage>(event.data as string | Blob | ArrayBuffer)
        .then((message) => {
          if (!shouldRunRef.current || socketRef.current !== socket) return;
          const resumption = message.sessionResumptionUpdate;
          if (resumption?.resumable && resumption.newHandle) {
            resumptionHandleRef.current = resumption.newHandle;
          }
          if (message.setupComplete) {
            setupCompleteRef.current = true;
            clearStableSessionTimer();
            stableSessionTimerRef.current = setTimeout(() => {
              if (shouldRunRef.current && socketRef.current === socket && setupCompleteRef.current) {
                reconnectAttemptRef.current = 0;
              }
            }, 30_000);
            setProviderNote(resumeHandle
              ? "Gemini Live reconnected—the conversation continued automatically."
              : "Gemini Live is the primary voice provider.");
            setError("");
            if (!resumeHandle) {
              socket.send(JSON.stringify({
                clientContent: {
                  turns: [
                    ...credentials.initialHistory.map((turn) => ({
                      role: turn.role,
                      parts: [{ text: turn.text }],
                    })),
                    {
                      role: "user",
                      parts: [{
                        text: credentials.initialHistory.length
                          ? credentials.sessionOpening
                          : `Begin this private practice session now. Say this exact opening line and nothing else: ${JSON.stringify(credentials.sessionOpening)}`,
                      }],
                    },
                  ],
                  turnComplete: true,
                },
              }));
            }
            if (!pausedRef.current) setState("listening");
            if (!captureRef.current) {
              void connectGeminiCapture(stream, audioContext).catch((cause) => {
                retireGeminiSocket(socket, "Microphone capture failed");
                scheduleGeminiReconnect(cause instanceof Error ? cause.message : "Microphone audio could not start.");
              });
            }
          }
          const content = message.serverContent;
          if (content?.interrupted && !pausedRef.current) {
            clearPlayback();
          if (!pausedRef.current) setState("listening");
          }
          const userText = content?.inputTranscription?.text;
          if (userText) {
            if (!userTurnRef.current) {
              setUserCaption("");
              setBotCaption("");
            }
            userTurnRef.current += userText;
            setUserCaption(userTurnRef.current.trim());
          }
          const outputText = content?.outputTranscription?.text;
          if (outputText) {
            botTurnRef.current += outputText;
            setBotCaption(botTurnRef.current.trim());
          }
          for (const part of content?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) playGeminiAudio(part.inlineData.data, part.inlineData.mimeType);
          }
          if (content?.turnComplete) {
            void saveCompletedVoiceTurn("gemini");
          }
          if (message.toolCall?.functionCalls?.length) {
            void answerToolCalls(message.toolCall.functionCalls, socket).catch((cause) => {
              setError(cause instanceof Error ? cause.message : "The live tool could not complete.");
            });
          }
          if (message.goAway) {
            retireGeminiSocket(socket, "Refreshing Gemini Live connection");
            scheduleGeminiReconnect("Gemini Live requested a routine connection refresh.");
          }
        })
        .catch((cause) => {
          retireGeminiSocket(socket, "Unreadable response");
          scheduleGeminiReconnect(cause instanceof Error ? cause.message : "Gemini Live returned an unreadable response.");
        });
    };
    socket.onerror = () => {
      if (!shouldRunRef.current || socketRef.current !== socket) return;
      retireGeminiSocket(socket, "Connection error");
      scheduleGeminiReconnect("The Gemini Live connection failed.");
    };
    socket.onclose = (event) => {
      if (!shouldRunRef.current || socketRef.current !== socket) return;
      retireGeminiSocket(socket, "Connection closed");
      const detail = event.reason ? ` (${event.code}: ${event.reason})` : ` (${event.code})`;
      scheduleGeminiReconnect(`The Gemini Live connection ended${detail}.`);
    };
  }

  async function switchToGemini(message: string) {
    if (fallbackInProgressRef.current || !shouldRunRef.current) return;
    fallbackInProgressRef.current = true;
    closeResources();
    resumptionHandleRef.current = null;
    reconnectAttemptRef.current = 0;
    setProvider("Gemini Live");
    setProviderNote(message);
    setError("");
    setState("connecting");
    try {
      await connectGemini(null);
    } catch (cause) {
      closeResources();
      shouldRunRef.current = false;
      setError(cause instanceof Error ? cause.message : "Gemini Live could not start.");
      setState("error");
    } finally {
      fallbackInProgressRef.current = false;
    }
  }

  async function startElevenLabs(allowGeminiFallback = true) {
    setProvider("ElevenLabs");
    try {
      const [session, { Conversation }] = await Promise.all([
        apiRequest<BotVoiceSessionResponse>(`/v1/bots/${bot.id}/session`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        import("@elevenlabs/client"),
      ]);
      const conversation = await Conversation.startSession({
        signedUrl: session.signedUrl,
        connectionType: "websocket",
        textOnly: false,
        overrides: {
          agent: {
            firstMessage: session.firstMessage,
            prompt: { prompt: session.promptOverride },
          },
        },
        onConversationCreated: (created) => {
          conversationRef.current = created;
        },
        clientTools: {
          review_recent_attachment: async (parameters: { question?: unknown }) => {
            return JSON.stringify(await reviewRecentAttachment(parameters?.question));
          },
          create_pdf_document: async (parameters: { title?: unknown; content?: unknown }) => {
            return JSON.stringify(await createPdfDocument(parameters?.title, parameters?.content));
          },
          research_current_market: async (parameters: { question?: unknown }) => {
            return JSON.stringify(await researchCurrentMarket(parameters?.question));
          },
        },
        onConnect: () => { if (!pausedRef.current) setState("listening"); },
        onModeChange: ({ mode }) => {
          if (!pausedRef.current) setState(mode === "speaking" ? "speaking" : "listening");
        },
        onMessage: ({ role, message }) => {
          if (!message.trim()) return;
          if (role === "user") {
            userTurnRef.current = message.trim();
            botTurnRef.current = "";
            setBotCaption("");
            setUserCaption(userTurnRef.current);
            return;
          }
          botTurnRef.current = message.trim();
          setBotCaption(botTurnRef.current);
          void saveCompletedVoiceTurn("elevenlabs");
        },
        onError: (message) => {
          if (!shouldRunRef.current) return;
          void switchToGemini(/quota|exceeds your.*limit|credits? exhausted/i.test(message)
            ? "ElevenLabs fallback quota is unavailable, so the conversation returned to Gemini Live."
            : "The ElevenLabs fallback disconnected, so the conversation returned to Gemini Live.");
        },
        onDisconnect: (details) => {
          conversationRef.current = null;
          if (!shouldRunRef.current) return;
          const disconnectMessage = details.reason === "error"
            ? details.message
            : details.reason === "agent"
              ? [details.closeReason, details.context?.reason].filter(Boolean).join(" ")
              : "";
          void switchToGemini(/quota|exceeds your.*limit|credits? exhausted/i.test(disconnectMessage)
            ? "ElevenLabs fallback quota is unavailable, so the conversation returned to Gemini Live."
            : "The ElevenLabs fallback ended, so the conversation returned to Gemini Live.");
        },
      });
      conversationRef.current = conversation;
    } catch (cause) {
      if (allowGeminiFallback && cause instanceof ApiRequestError && (cause.status === 429 || cause.status === 503)) {
        await switchToGemini("ElevenLabs is unavailable, so live voice switched to Gemini Live automatically.");
        return;
      }
      throw cause;
    }
  }

  async function switchToElevenLabs(message: string) {
    if (fallbackInProgressRef.current || !shouldRunRef.current) return;
    fallbackInProgressRef.current = true;
    closeResources();
    setProvider("ElevenLabs");
    setProviderNote(message);
    setError("");
    setState("connecting");
    try {
      await startElevenLabs(false);
    } catch (cause) {
      closeResources();
      shouldRunRef.current = false;
      setError(providerError(cause));
      setState("error");
    } finally {
      fallbackInProgressRef.current = false;
    }
  }

  async function start() {
    shouldRunRef.current = false;
    closeResources();
    shouldRunRef.current = true;
    resumptionHandleRef.current = null;
    reconnectAttemptRef.current = 0;
    setState("connecting");
    setProvider("Gemini Live");
    setProviderNote("Gemini Live is the primary voice provider.");
    setPersistenceIssue("");
    setError("");
    setUserCaption("");
    setBotCaption("");
    userTurnRef.current = "";
    botTurnRef.current = "";
    try {
      await connectGemini(null);
    } catch (geminiCause) {
      if (!shouldRunRef.current) return;
      setProviderNote("Gemini Live could not start, so ElevenLabs is being tried as a fallback.");
      try {
        await startElevenLabs(false);
      } catch (elevenLabsCause) {
        closeResources();
        shouldRunRef.current = false;
        setError(elevenLabsCause instanceof Error
          ? elevenLabsCause.message
          : geminiCause instanceof Error ? geminiCause.message : "Live voice could not start.");
        setState("error");
      }
    }
  }

  async function stop() {
    shouldRunRef.current = false;
    closeResources();
    resumptionHandleRef.current = null;
    reconnectAttemptRef.current = 0;
    fallbackInProgressRef.current = false;
    setState("idle");
  }

  async function togglePause() {
    const nextPaused = !pausedRef.current;
    pausedRef.current = nextPaused;
    conversationRef.current?.setMicMuted(nextPaused);
    conversationRef.current?.setVolume({ volume: nextPaused ? 0 : 1 });
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextPaused;
    });
    const audioContext = audioContextRef.current;
    if (nextPaused) {
      clearPlayback();
      if (audioContext?.state === "running") await audioContext.suspend().catch(() => undefined);
      setState("paused");
      return;
    }
    if (audioContext?.state === "suspended") await audioContext.resume().catch(() => undefined);
    setState("listening");
  }

  const live = state === "listening" || state === "speaking" || state === "connecting" || state === "paused";
  const stateLabel = state === "speaking"
    ? `${bot.name} is speaking`
    : state === "listening"
      ? `Listening on ${provider}`
      : state === "connecting"
        ? "Connecting live voice"
        : state === "paused"
          ? "Conversation paused · microphone is off"
        : "Talk naturally with your specialist";
  return (
    <section className={`${styles.voicePreview} ${variant === "workspace" ? styles.workspaceVoicePreview : ""}`} data-voice-panel aria-label={variant === "workspace" ? "Live voice" : "Voice preview"}>
      <div className={styles.voiceOrb} data-state={state} aria-hidden="true">
        <span /><span /><span />
      </div>
      <StatusBadge tone={bot.status === "active" ? "success" : "warning"}>
        {state === "speaking" ? `${bot.name} is speaking` : state === "listening" ? `Listening · ${provider}` : state === "paused" ? "Paused" : bot.status}
      </StatusBadge>
      <h3>{variant === "workspace" ? "Live voice" : "Talk to your bot"}</h3>
      <p>{variant === "workspace" ? stateLabel : bot.instructions.firstMessage}</p>
      {showTranscript && (userCaption || botCaption) && (
        <div className={styles.transcript} aria-live="polite">
          {userCaption && <p><b>You</b>{userCaption}</p>}
          {botCaption && <p><b>{bot.name}</b>{botCaption}</p>}
        </div>
      )}
      {providerNote && <p className={styles.providerNote}>{providerNote}</p>}
      {persistenceIssue && <p className={styles.error} role="status">{persistenceIssue}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {live && variant === "workspace" ? (
        <div className={styles.workspaceVoiceActions}>
          <Button variant="secondary" disabled={state === "connecting"} onClick={() => void togglePause()}>{state === "paused" ? "Resume" : "Pause"}</Button>
          <Button variant="danger" onClick={() => void stop()}>End</Button>
        </div>
      ) : live ? (
        <Button variant="danger" onClick={() => void stop()}>End preview</Button>
      ) : (
        <Button disabled={bot.status !== "active"} onClick={() => void start()}>
          {variant === "workspace" ? "Start live voice" : "Start voice preview"}
        </Button>
      )}
      {bot.status !== "active" && <small>Save and activate the latest draft first.</small>}
    </section>
  );
}

export function BotStudio({ user }: { user: CurrentUser }) {
  const [bots, setBots] = useState<BotDefinition[]>([]);
  const [templates, setTemplates] = useState<BotTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateBotRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [creatorStep, setCreatorStep] = useState<CreatorStep>("identity");
  const [error, setError] = useState("");
  const selected = bots.find((bot) => bot.id === selectedId) ?? null;
  const draftIsDirty = Boolean(selected && draft &&
    JSON.stringify(draft) !== JSON.stringify(draftFromBot(selected)));
  const readiness = draft ? [
    Boolean(draft.name?.trim() && draft.description?.trim() && draft.instructions?.firstMessage.trim()),
    Boolean(draft.context?.audience.trim()),
    Boolean(draft.instructions?.personality.trim() && draft.instructions.goal.trim() && draft.instructions.boundaries.trim()),
    Boolean(draft.voice?.enabled && (draft.starterPrompts?.filter((prompt) => prompt.trim()).length ?? 0) > 0),
  ] : [false, false, false, false];
  const readinessPercent = Math.round(readiness.filter(Boolean).length / readiness.length * 100);

  useEffect(() => {
    void Promise.all([
      apiRequest<BotListResponse>("/v1/bots"),
      apiRequest<BotTemplateListResponse>("/v1/bots/templates"),
    ]).then(([botResult, templateResult]) => {
      setBots(botResult.bots);
      setTemplates(templateResult.templates);
      setSelectedId(botResult.bots[0]?.id ?? null);
      setDraft(botResult.bots[0] ? draftFromBot(botResult.bots[0]) : null);
      setShowTemplates(botResult.bots.length === 0);
    }).catch((cause) => setError(providerError(cause))).finally(() => setLoading(false));
  }, [user.id]);

  function selectBot(bot: BotDefinition) {
    setSelectedId(bot.id);
    setDraft(draftFromBot(bot));
    setShowTemplates(false);
    setCreatorStep("identity");
    setError("");
  }

  async function createBot(template: BotTemplate) {
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<BotResponse>("/v1/bots", {
        method: "POST",
        body: JSON.stringify({ templateId: template.id }),
      });
      setBots((current) => [response.bot, ...current]);
      selectBot(response.bot);
    } catch (cause) {
      setError(providerError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function save(): Promise<BotDefinition | null> {
    if (!selected || !draft) return null;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<BotResponse>(`/v1/bots/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      setBots((current) => current.map((bot) => bot.id === response.bot.id ? response.bot : bot));
      setDraft(draftFromBot(response.bot));
      return response.bot;
    } catch (cause) {
      setError(providerError(cause));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    const saved = await save();
    if (!saved) return;
    setActivating(true);
    setError("");
    try {
      const response = await apiRequest<BotResponse>(`/v1/bots/${saved.id}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBots((current) => current.map((bot) => bot.id === response.bot.id ? response.bot : bot));
      setDraft(draftFromBot(response.bot));
    } catch (cause) {
      setError(providerError(cause));
    } finally {
      setActivating(false);
    }
  }

  function change<K extends keyof UpdateBotRequest>(key: K, value: UpdateBotRequest[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="forgefit.space home"><BrandLockup /></Link>
        <span className={styles.productName}>Forge Studio <i>beta</i></span>
        <nav><Link href="/studio/operations">Operations</Link><Link href="/">Fitness workspace</Link><Link href="/signout">Sign out</Link><b>{initials}</b></nav>
      </header>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div><span>Your specialists</span><button type="button" onClick={() => setShowTemplates(true)}>＋</button></div>
          <button className={styles.newBot} type="button" onClick={() => setShowTemplates(true)}>Create a specialist</button>
          <div className={styles.botList}>
            {bots.map((bot) => (
              <button className={bot.id === selectedId && !showTemplates ? styles.activeBot : ""} key={bot.id} type="button" onClick={() => selectBot(bot)}>
                <i>{bot.vertical === "interview" ? "◎" : bot.vertical === "resume" ? "▤" : bot.vertical === "fitness" ? "ϟ" : "✦"}</i>
                <span><b>{bot.name}</b><small>{bot.vertical} · {bot.status}</small></span>
              </button>
            ))}
          </div>
          <p>Original personal-specialist tooling for ForgeFit products. No contact-center or customer-support workflows.</p>
        </aside>

        <section className={styles.workspace}>
          {loading ? (
            <div className={styles.loading}>Loading Forge Studio…</div>
          ) : showTemplates || !selected || !draft ? (
            <section className={styles.templates}>
              <span className={styles.eyebrow}>Choose a starting point</span>
              <h1>Build one bot for <em>one clear job.</em></h1>
              <p>Each template starts with its own behavior, boundaries, voice rhythm, and conversation starters. You can change every part.</p>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={styles.templateGrid}>
                {templates.map((template) => (
                  <article key={template.id}>
                    <i>{template.icon}</i><span>{template.vertical}</span>
                    <h2>{template.name}</h2>
                    <p>{template.description}</p>
                    <Button busy={saving} variant={template.id === "interview_coach" ? "primary" : "secondary"} onClick={() => void createBot(template)}>
                      Use this template
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <>
              <header className={styles.editorHeader}>
                <div><span className={styles.eyebrow}>{selected.vertical} specialist</span><h1>{draft.name}</h1><p>Configure the bot’s job, behavior, safety boundaries, and natural voice.</p></div>
                <div>{selected.status === "active" && !draftIsDirty && <Link className={styles.openWorkspace} href={`/studio/bots/${selected.id}`}>Open workspace ↗</Link>}<Button variant="secondary" busy={saving} onClick={() => void save()}>Save draft</Button><Button busy={activating} onClick={() => void activate()}>{activating ? "Activating…" : selected.status === "active" ? "Sync & activate" : "Activate bot"}</Button></div>
              </header>
              {error && <p className={styles.errorBanner} role="alert">{error}</p>}
              <nav className={styles.creatorNav} aria-label="Bot creation steps">
                {([
                  ["identity", "01", "Identity"],
                  ["context", "02", "Personalise"],
                  ["behavior", "03", "Behaviour"],
                  ["voice", "04", "Voice & test"],
                ] as const).map(([id, number, label], index) => (
                  <button
                    className={creatorStep === id ? styles.activeStep : ""}
                    key={id}
                    onClick={() => setCreatorStep(id)}
                    type="button"
                  >
                    <i>{readiness[index] ? "✓" : number}</i><span>{label}</span>
                  </button>
                ))}
              </nav>
              <div className={styles.editorGrid}>
                <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
                  {creatorStep === "identity" && <section>
                    <div className={styles.sectionTitle}><span>01</span><div><h2>Identity</h2><p>Give this specialist a clear promise.</p></div></div>
                    <div className={styles.creatorTip}><i>✦</i><p><b>Start simple.</b> A clear name and one narrow promise make a better bot than a long list of unrelated abilities.</p></div>
                    <div className={styles.twoFields}>
                      <Field label="Bot name"><input value={draft.name ?? ""} onChange={(event) => change("name", event.target.value)} /></Field>
                      <Field label="Specialty"><input value={selected.vertical} disabled /></Field>
                    </div>
                    <Field label="What does this bot help with?" hint="One sentence users can understand before starting."><textarea rows={2} value={draft.description ?? ""} onChange={(event) => change("description", event.target.value)} /></Field>
                    <Field label="First message" hint="The opening should make the next step obvious."><textarea rows={3} value={draft.instructions?.firstMessage ?? ""} onChange={(event) => change("instructions", { ...draft.instructions!, firstMessage: event.target.value })} /></Field>
                    <div className={styles.stepActions}><Button onClick={() => setCreatorStep("context")}>Next: personalise</Button></div>
                  </section>}
                  {creatorStep === "context" && <section>
                    <div className={styles.sectionTitle}><span>02</span><div><h2>Personalise</h2><p>Give this bot the context it needs—nothing more.</p></div></div>
                    <div className={styles.creatorTip}><i>◎</i><p><b>For interview preparation:</b> add your target role, strongest real projects, and the job description. The bot will use them to ask relevant questions without inventing experience.</p></div>
                    <Field label="Who is this bot helping?" hint="Example: Me, preparing for senior frontend engineering interviews."><input value={draft.context?.audience ?? ""} onChange={(event) => change("context", { ...draft.context!, audience: event.target.value })} /></Field>
                    <Field label="What should it know about you?" hint="Paste a concise career summary, real projects, skills, and areas you want to improve."><textarea rows={7} placeholder="I have 5 years of frontend experience…" value={draft.context?.personalContext ?? ""} onChange={(event) => change("context", { ...draft.context!, personalContext: event.target.value })} /></Field>
                    <Field label="Job description or reference notes" hint="Paste the target JD, interview format, company notes, or resume bullets. This stays scoped to your bot."><textarea rows={9} placeholder="Target role: Senior Frontend Engineer…" value={draft.context?.referenceMaterial ?? ""} onChange={(event) => change("context", { ...draft.context!, referenceMaterial: event.target.value })} /></Field>
                    <div className={styles.toolAccess}>
                      <div><b>Specialist tools</b><small>Choose which evidence sources this bot may use.</small></div>
                      <label aria-label="Live web research" className={styles.voiceToggle} htmlFor="studio-web-research"><input id="studio-web-research" type="checkbox" checked={draft.capabilities?.webResearch ?? false} onChange={(event) => change("capabilities", { ...draft.capabilities!, webResearch: event.target.checked })} /><span><b>Live web research</b><small>Search current market values, salaries, hiring trends, company expectations, and recent technologies with visible sources. Production research uses capped Vertex AI access from the ForgeFit server.</small></span></label>
                      <label aria-label="Document review" className={styles.voiceToggle} htmlFor="studio-document-review"><input id="studio-document-review" type="checkbox" checked={draft.capabilities?.documentReview ?? false} onChange={(event) => change("capabilities", { ...draft.capabilities!, documentReview: event.target.checked })} /><span><b>Document review</b><small>Inspect PDFs and images attached inside this bot’s private conversation.</small></span></label>
                    </div>
                    <div className={styles.stepActions}><Button variant="secondary" onClick={() => setCreatorStep("identity")}>Back</Button><Button onClick={() => setCreatorStep("behavior")}>Next: behaviour</Button></div>
                  </section>}
                  {creatorStep === "behavior" && <section>
                    <div className={styles.sectionTitle}><span>03</span><div><h2>Behaviour</h2><p>Shape how the specialist thinks, responds, and stays honest.</p></div></div>
                    <Field label="Personality" hint="Describe 2–3 traits and the relationship it should have with you."><textarea rows={4} value={draft.instructions?.personality ?? ""} onChange={(event) => change("instructions", { ...draft.instructions!, personality: event.target.value })} /></Field>
                    <Field label="What does a successful session look like?" hint="Use an explicit sequence: learn the role → ask one question → probe → debrief."><textarea rows={6} value={draft.instructions?.goal ?? ""} onChange={(event) => change("instructions", { ...draft.instructions!, goal: event.target.value })} /></Field>
                    <Field label="Boundaries" hint="State what the bot must not invent, promise, diagnose, or do."><textarea rows={5} value={draft.instructions?.boundaries ?? ""} onChange={(event) => change("instructions", { ...draft.instructions!, boundaries: event.target.value })} /></Field>
                    <div className={styles.stepActions}><Button variant="secondary" onClick={() => setCreatorStep("context")}>Back</Button><Button onClick={() => setCreatorStep("voice")}>Next: voice & test</Button></div>
                  </section>}
                  {creatorStep === "voice" && <section>
                    <div className={styles.sectionTitle}><span>04</span><div><h2>Voice & test</h2><p>Choose the conversational rhythm and useful starting points.</p></div></div>
                    <label className={styles.voiceToggle} htmlFor="studio-voice-enabled"><input aria-label="Enable natural voice conversations" id="studio-voice-enabled" type="checkbox" checked={draft.voice?.enabled ?? true} onChange={(event) => change("voice", { ...draft.voice!, enabled: event.target.checked })} /><span><b>Natural voice conversations</b><small>Use this bot in real-time from your private Studio.</small></span></label>
                    <div className={styles.twoFields}>
                      <Field label="Turn-taking"><select value={draft.voice?.turnEagerness ?? "normal"} onChange={(event) => change("voice", { ...draft.voice!, turnEagerness: event.target.value as "patient" | "normal" | "eager" })}><option value="patient">Patient</option><option value="normal">Normal</option><option value="eager">Eager</option></select></Field>
                          <Field label="ElevenLabs fallback voice" hint="Gemini Live is primary. Leave blank to use the workspace fallback voice."><input value={draft.voice?.voiceId ?? ""} placeholder="Workspace fallback voice" onChange={(event) => change("voice", { ...draft.voice!, voiceId: event.target.value.trim() || null })} /></Field>
                    </div>
                    <div className={styles.starterHeader}><div><b>Conversation starters</b><small>Useful shortcuts for the sessions you run most.</small></div>{(draft.starterPrompts?.length ?? 0) < 5 && <button type="button" onClick={() => change("starterPrompts", [...(draft.starterPrompts ?? []), "New conversation starter"])}>＋ Add starter</button>}</div>
                    <div className={styles.starterList}>
                      {(draft.starterPrompts ?? []).map((prompt, index) => (
                        <div key={index}><span>{index + 1}</span><input value={prompt} onChange={(event) => change("starterPrompts", (draft.starterPrompts ?? []).map((value, candidate) => candidate === index ? event.target.value : value))} /><button type="button" aria-label={`Remove starter ${index + 1}`} onClick={() => change("starterPrompts", (draft.starterPrompts ?? []).filter((_, candidate) => candidate !== index))}>×</button></div>
                      ))}
                    </div>
                    <div className={styles.upcoming}><span>Evidence-first</span><p>When live research is enabled, current claims are dated and displayed with source cards. The bot must label estimates instead of pretending uncertain information is fact.</p></div>
                    <div className={styles.stepActions}><Button variant="secondary" onClick={() => setCreatorStep("behavior")}>Back</Button><Button busy={saving} onClick={() => void save()}>Save latest draft</Button></div>
                  </section>}
                </form>
                <aside className={styles.previewRail}>
                  <BotVoicePanel bot={{
                    ...selected,
                    ...draft,
                    status: draftIsDirty ? "draft" : selected.status,
                  } as BotDefinition} />
                  <section className={styles.readinessCard}>
                    <div><span>Activation readiness</span><b>{readinessPercent}%</b></div>
                    <strong><i style={{ width: `${readinessPercent}%` }} /></strong>
                    <ul>{["Identity is clear", "Audience is defined", "Behaviour has guardrails", "Voice has a starting point"].map((item, index) => <li data-ready={readiness[index]} key={item}><i>{readiness[index] ? "✓" : "·"}</i>{item}</li>)}</ul>
                  </section>
                  <section className={styles.safetyCard}><span>Built-in safeguards</span><h3>Focused by design.</h3><ul><li>On-topic focus guardrail</li><li>Prompt-injection protection</li><li>Private voice recording disabled</li><li>Explicit bot-specific boundaries</li></ul></section>
                </aside>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
