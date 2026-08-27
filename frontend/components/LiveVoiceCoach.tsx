"use client";

import type {
  CoachThreadDetail,
  ElevenLabsCoachSessionResponse,
  LiveCoachAvatarTokenResponse,
  LiveCoachSnapshotResponse,
  LiveCoachTokenResponse,
} from "@fitai/contracts";
import type { Conversation as ElevenLabsConversation } from "@elevenlabs/client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveCoachCamera } from "@/components/LiveCoachCamera";
import { apiRequest } from "@/lib/api";
import {
  decodeLiveServerMessage,
  type LiveMovementSignal,
  movementSignalText,
  shouldSendMovementSignal,
} from "@/lib/live-voice";

type LiveState = "idle" | "connecting" | "listening" | "speaking" | "ending" | "error";
type ConnectionStage = "microphone" | "avatar" | "authorizing" | "elevenlabs" | "socket" | "setup" | "reconnecting";

type LiveVoiceCoachProps = {
  threadId: string;
  activeSessionId: string | null;
  movementSignal?: LiveMovementSignal | null;
  onThreadUpdate: (detail: CoachThreadDetail) => void;
  onClose: () => void;
};

type FunctionCall = { id?: string; name?: string; args?: Record<string, unknown> };
type AvatarClient = {
  ClearBuffer: () => void;
  on: (event: "error" | "speaking" | "silent" | "start" | "startup_error", callback: (message?: string) => void) => void;
  sendAudioData: (audio: Uint8Array) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};
type LiveServerMessage = {
  setupComplete?: Record<string, never>;
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  };
  toolCall?: { functionCalls?: FunctionCall[] };
  goAway?: { timeLeft?: string };
  sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string };
};

function bytesToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function sampleRateFromMimeType(mimeType = "") {
  const match = mimeType.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24_000;
}

function decodePcm(data: string) {
  const binary = atob(data);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    view.setUint8(index, binary.charCodeAt(index));
  }
  const samples = new Float32Array(Math.floor(binary.length / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

function pcmForAvatar(data: string, mimeType?: string) {
  const input = decodePcm(data);
  if (!input.length) return new Uint8Array();
  const sourceRate = sampleRateFromMimeType(mimeType);
  const targetRate = 16_000;
  const outputLength = Math.max(1, Math.floor(input.length * targetRate / sourceRate));
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * sourceRate / targetRate;
    const before = Math.min(input.length - 1, Math.floor(sourcePosition));
    const after = Math.min(input.length - 1, before + 1);
    const mix = sourcePosition - before;
    const sample = input[before] * (1 - mix) + input[after] * mix;
    view.setInt16(index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true);
  }
  return bytes;
}

function sessionLabel(state: LiveState, stage: ConnectionStage) {
  if (state === "connecting" && stage === "microphone") return "Waiting for microphone access…";
  if (state === "connecting" && stage === "avatar") return "Bringing your coach on screen…";
  if (state === "connecting" && stage === "authorizing") return "Authorizing your live coach…";
  if (state === "connecting" && stage === "elevenlabs") return "Connecting your natural voice coach…";
  if (state === "connecting" && stage === "socket") return "Opening the live audio channel…";
  if (state === "connecting" && stage === "setup") return "Preparing your personalized coach…";
  if (state === "connecting" && stage === "reconnecting") return "Reconnecting without losing context…";
  if (state === "listening") return "Listening — speak naturally";
  if (state === "speaking") return "Coach is speaking — interrupt anytime";
  if (state === "ending") return "Ending session…";
  if (state === "error") return "Session needs attention";
  return "Ready for a real-time conversation";
}

export function LiveVoiceCoach({
  threadId,
  activeSessionId,
  movementSignal = null,
  onThreadUpdate,
  onClose,
}: LiveVoiceCoachProps) {
  const [state, setState] = useState<LiveState>("idle");
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>("microphone");
  const [error, setError] = useState("");
  const [avatarIssue, setAvatarIssue] = useState("");
  const [avatarReady, setAvatarReady] = useState(false);
  const [userCaption, setUserCaption] = useState("");
  const [coachCaption, setCoachCaption] = useState("");
  const [cameraMovementSignal, setCameraMovementSignal] = useState<LiveMovementSignal | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const elevenLabsConversationRef = useRef<ElevenLabsConversation | null>(null);
  const voiceProviderRef = useRef<"elevenlabs" | "gemini">("elevenlabs");
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const avatarAudioRef = useRef<HTMLAudioElement | null>(null);
  const avatarClientRef = useRef<AvatarClient | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextPlaybackAtRef = useRef(0);
  const userTurnRef = useRef("");
  const coachTurnRef = useRef("");
  const mountedRef = useRef(true);
  const setupCompleteRef = useRef(false);
  const shouldRunRef = useRef(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenLabsResponseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const connectedAtRef = useRef(0);
  const resumptionHandleRef = useRef<string | null>(null);
  const pendingMovementSignalRef = useRef<LiveMovementSignal | null>(null);
  const lastMovementSignalIdRef = useRef("");
  const avatarReadyRef = useRef(false);

  const clearSetupTimer = useCallback(() => {
    if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    setupTimerRef.current = null;
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }, []);

  const clearElevenLabsResponseTimer = useCallback(() => {
    if (elevenLabsResponseTimerRef.current) clearTimeout(elevenLabsResponseTimerRef.current);
    elevenLabsResponseTimerRef.current = null;
  }, []);

  const clearPlayback = useCallback(() => {
    for (const source of outputSourcesRef.current) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    outputSourcesRef.current.clear();
    nextPlaybackAtRef.current = audioContextRef.current?.currentTime ?? 0;
  }, []);

  const closeResources = useCallback(() => {
    shouldRunRef.current = false;
    clearSetupTimer();
    clearReconnectTimer();
    clearElevenLabsResponseTimer();
    captureNodeRef.current?.disconnect();
    captureSourceRef.current?.disconnect();
    captureNodeRef.current = null;
    captureSourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearPlayback();
    const avatarClient = avatarClientRef.current;
    avatarClientRef.current = null;
    avatarReadyRef.current = false;
    if (avatarClient) void avatarClient.stop().catch(() => undefined);
    const elevenLabsConversation = elevenLabsConversationRef.current;
    elevenLabsConversationRef.current = null;
    if (elevenLabsConversation) void elevenLabsConversation.endSession().catch(() => undefined);
    const avatarVideo = avatarVideoRef.current;
    const avatarAudio = avatarAudioRef.current;
    if (avatarVideo) avatarVideo.srcObject = null;
    if (avatarAudio) avatarAudio.srcObject = null;
    if (mountedRef.current) setAvatarReady(false);
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "Session ended");
    }
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }, [clearElevenLabsResponseTimer, clearPlayback, clearReconnectTimer, clearSetupTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closeResources();
    };
  }, [closeResources]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      closeResources();
      setState("idle");
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    window.addEventListener("pagehide", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      window.removeEventListener("pagehide", stopWhenHidden);
    };
  }, [closeResources]);

  useEffect(() => {
    const currentMovementSignal = cameraMovementSignal ?? movementSignal;
    if (
      !currentMovementSignal ||
      currentMovementSignal.id === lastMovementSignalIdRef.current ||
      !shouldSendMovementSignal(currentMovementSignal)
    ) return;
    lastMovementSignalIdRef.current = currentMovementSignal.id;
    pendingMovementSignalRef.current = currentMovementSignal;
    const elevenLabsConversation = elevenLabsConversationRef.current;
    if (elevenLabsConversation?.isOpen()) {
      elevenLabsConversation.sendContextualUpdate(movementSignalText(currentMovementSignal));
      pendingMovementSignalRef.current = null;
      return;
    }
    const socket = socketRef.current;
    if (!setupCompleteRef.current || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      realtimeInput: { text: movementSignalText(currentMovementSignal) },
    }));
    pendingMovementSignalRef.current = null;
  }, [cameraMovementSignal, movementSignal]);

  function playAudio(data: string, mimeType?: string) {
    const avatarClient = avatarClientRef.current;
    if (avatarClient) {
      avatarClient.sendAudioData(pcmForAvatar(data, mimeType));
      setState("speaking");
      return;
    }
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state === "closed") return;
    const samples = decodePcm(data);
    if (!samples.length) return;
    const buffer = audioContext.createBuffer(1, samples.length, sampleRateFromMimeType(mimeType));
    buffer.copyToChannel(samples, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    const startAt = Math.max(audioContext.currentTime + 0.015, nextPlaybackAtRef.current);
    nextPlaybackAtRef.current = startAt + buffer.duration;
    outputSourcesRef.current.add(source);
    source.onended = () => {
      outputSourcesRef.current.delete(source);
      if (mountedRef.current && outputSourcesRef.current.size === 0) setState("listening");
    };
    source.start(startAt);
    setState("speaking");
  }

  async function saveCompletedTurn() {
    const userTranscript = userTurnRef.current.trim();
    const assistantTranscript = coachTurnRef.current.trim();
    userTurnRef.current = "";
    coachTurnRef.current = "";
    if (!userTranscript || !assistantTranscript) return;
    try {
      const detail = await apiRequest<CoachThreadDetail>("/v1/coach/live-turns", {
        method: "POST",
        body: JSON.stringify({
          threadId,
          sessionId: activeSessionId ?? undefined,
          userTranscript,
          assistantTranscript,
          provider: voiceProviderRef.current,
        }),
      });
      if (mountedRef.current) onThreadUpdate(detail);
    } catch {
      // The live session should continue even if transcript persistence briefly fails.
    }
  }

  async function answerToolCalls(calls: FunctionCall[]) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const query = activeSessionId ? `?sessionId=${encodeURIComponent(activeSessionId)}` : "";
    const snapshot = await apiRequest<LiveCoachSnapshotResponse>(`/v1/coach/live-snapshot${query}`);
    socket.send(JSON.stringify({
      toolResponse: {
        functionResponses: calls.map((call) => ({
          id: call.id,
          name: call.name,
          response: { result: snapshot },
        })),
      },
    }));
  }

  function handleServerMessage(
    message: LiveServerMessage,
    socket: WebSocket,
    initialHistory: LiveCoachTokenResponse["initialHistory"],
    resumed: boolean,
  ) {
    const resumption = message.sessionResumptionUpdate;
    if (resumption?.resumable && resumption.newHandle) {
      resumptionHandleRef.current = resumption.newHandle;
    }
    if ("setupComplete" in message) {
      setupCompleteRef.current = true;
      connectedAtRef.current = Date.now();
      clearSetupTimer();
      setError("");
      if (!resumed && initialHistory.length) {
        socket.send(JSON.stringify({
          clientContent: {
            turns: initialHistory.map((turn) => ({
              role: turn.role,
              parts: [{ text: turn.text }],
            })),
            turnComplete: false,
          },
        }));
      }
      const pendingMovement = pendingMovementSignalRef.current;
      if (pendingMovement) {
        socket.send(JSON.stringify({
          realtimeInput: { text: movementSignalText(pendingMovement) },
        }));
        pendingMovementSignalRef.current = null;
      }
      setState("listening");
      const stream = streamRef.current;
      const audioContext = audioContextRef.current;
      if (stream && audioContext && !captureNodeRef.current) {
        void connectCapture(stream, audioContext).catch((cause) => {
          setError(cause instanceof Error ? cause.message : "Microphone audio could not start.");
          setState("error");
          closeResources();
        });
      }
    }
    const content = message.serverContent;
    if (content?.interrupted) {
      avatarClientRef.current?.ClearBuffer();
      clearPlayback();
      setState("listening");
    }
    const inputText = content?.inputTranscription?.text;
    if (inputText) {
      if (!userTurnRef.current) {
        setUserCaption("");
        setCoachCaption("");
      }
      userTurnRef.current += inputText;
      setUserCaption(userTurnRef.current.trim());
    }
    const outputText = content?.outputTranscription?.text;
    if (outputText) {
      if (!coachTurnRef.current) setUserCaption("");
      coachTurnRef.current += outputText;
      setCoachCaption(coachTurnRef.current.trim());
    }
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) playAudio(part.inlineData.data, part.inlineData.mimeType);
    }
    if (content?.turnComplete) void saveCompletedTurn();
    if (message.toolCall?.functionCalls?.length) {
      void answerToolCalls(message.toolCall.functionCalls).catch(() => {
        setError("I couldn't refresh your workout data. The conversation can continue.");
      });
    }
    if (message.goAway && shouldRunRef.current) {
      retireSocket(socket, "Refreshing live connection");
      scheduleReconnect("The voice provider is refreshing the connection.");
    }
  }

  async function connectCapture(stream: MediaStream, audioContext: AudioContext) {
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
    captureNodeRef.current = capture;
  }

  function retireSocket(socket: WebSocket, reason: string) {
    if (socketRef.current === socket) socketRef.current = null;
    clearSetupTimer();
    setupCompleteRef.current = false;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState < WebSocket.CLOSING) socket.close(1000, reason);
  }

  function scheduleReconnect(reason: string) {
    if (!shouldRunRef.current || reconnectTimerRef.current) return;
    if (connectedAtRef.current && Date.now() - connectedAtRef.current >= 30_000) {
      reconnectAttemptRef.current = 0;
    }
    const attempt = reconnectAttemptRef.current + 1;
    if (attempt > 3) {
      closeResources();
      setError(`${reason} Automatic reconnection was unsuccessful. Please retry.`);
      setState("error");
      return;
    }
    reconnectAttemptRef.current = attempt;
    setConnectionStage("reconnecting");
    setState("connecting");
    setError(`Connection interrupted. Reconnecting automatically (${attempt}/3)…`);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void (voiceProviderRef.current === "elevenlabs"
        ? connectElevenLabs(true)
        : connectSocket(true));
    }, 500 * 2 ** (attempt - 1));
  }

  async function connectAvatar() {
    const videoElement = avatarVideoRef.current;
    const audioElement = avatarAudioRef.current;
    if (!videoElement || !audioElement) return false;
    setConnectionStage("avatar");
    setAvatarIssue("");
    try {
      const credentials = await apiRequest<LiveCoachAvatarTokenResponse>(
        "/v1/coach/live-avatar-token",
        { method: "POST", signal: AbortSignal.timeout(20_000) },
      );
      if (!shouldRunRef.current) return false;
      const { LogLevel, SimliClient } = await import("simli-client/dist/client");
      const client = new SimliClient(
        credentials.sessionToken,
        videoElement,
        audioElement,
        null,
        LogLevel.INFO,
        "livekit",
      ) as AvatarClient;
      avatarClientRef.current = client;
      client.on("start", () => {
        if (!mountedRef.current || avatarClientRef.current !== client) return;
        avatarReadyRef.current = true;
        setAvatarReady(true);
        setAvatarIssue("");
        elevenLabsConversationRef.current?.setVolume({ volume: 0 });
        void audioElement.play().catch(() => undefined);
      });
      client.on("speaking", () => {
        if (mountedRef.current && avatarClientRef.current === client) setState("speaking");
      });
      client.on("silent", () => {
        if (mountedRef.current && avatarClientRef.current === client) setState("listening");
      });
      const failAvatar = (message?: string) => {
        if (!mountedRef.current || avatarClientRef.current !== client) return;
        avatarClientRef.current = null;
        void client.stop().catch(() => undefined);
        avatarReadyRef.current = false;
        setAvatarReady(false);
        elevenLabsConversationRef.current?.setVolume({ volume: 1 });
        setAvatarIssue(message || "Photoreal coach video disconnected; voice remains available.");
      };
      client.on("error", failAvatar);
      client.on("startup_error", failAvatar);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          client.start(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error("Photoreal coach video took too long to connect.")),
              20_000,
            );
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      return avatarClientRef.current === client;
    } catch (cause) {
      const client = avatarClientRef.current;
      avatarClientRef.current = null;
      avatarReadyRef.current = false;
      if (client) void client.stop().catch(() => undefined);
      if (mountedRef.current) {
        setAvatarReady(false);
        setAvatarIssue(cause instanceof Error
          ? `${cause.message} Voice-only mode is still available.`
          : "Photoreal coach video is unavailable. Voice-only mode is still available.");
      }
      return false;
    }
  }

  function armElevenLabsResponseTimer() {
    const expectedConversation = elevenLabsConversationRef.current;
    if (!expectedConversation) return;
    clearElevenLabsResponseTimer();
    elevenLabsResponseTimerRef.current = setTimeout(() => {
      if (
        !mountedRef.current ||
        !shouldRunRef.current ||
        voiceProviderRef.current !== "elevenlabs" ||
        elevenLabsConversationRef.current !== expectedConversation
      ) return;
      void switchToGeminiFallback(
        expectedConversation,
        "The natural voice provider connected but did not answer. Switched to backup voice automatically.",
      );
    }, 15_000);
  }

  async function switchToGeminiFallback(
    conversation: ElevenLabsConversation,
    message: string,
  ) {
    if (elevenLabsConversationRef.current !== conversation || !shouldRunRef.current) return;
    clearElevenLabsResponseTimer();
    elevenLabsConversationRef.current = null;
    await conversation.endSession().catch(() => undefined);
    if (!shouldRunRef.current) return;
    setAvatarIssue(message);
    setConnectionStage("reconnecting");
    setState("connecting");
    try {
      await startGeminiFallback();
    } catch (cause) {
      closeResources();
      setError(cause instanceof Error ? cause.message : "Backup live voice could not start.");
      setState("error");
    }
  }

  async function connectElevenLabs(reconnecting: boolean) {
    if (!shouldRunRef.current) return;
    voiceProviderRef.current = "elevenlabs";
    setConnectionStage(reconnecting ? "reconnecting" : "authorizing");
    const credentials = await apiRequest<ElevenLabsCoachSessionResponse>(
      "/v1/coach/elevenlabs-session",
      {
        method: "POST",
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({ threadId, sessionId: activeSessionId ?? undefined }),
      },
    );
    if (!shouldRunRef.current) return;
    setConnectionStage("elevenlabs");
    const { Conversation } = await import("@elevenlabs/client");
    const conversation = await Conversation.startSession({
      signedUrl: credentials.signedUrl,
      connectionType: "websocket",
      textOnly: false,
      dynamicVariables: credentials.dynamicVariables,
      onConversationCreated: (createdConversation) => {
        elevenLabsConversationRef.current = createdConversation;
        createdConversation.setVolume({ volume: avatarReadyRef.current ? 0 : 1 });
      },
      clientTools: {
        get_live_workout_snapshot: async () => {
          const query = activeSessionId ? `?sessionId=${encodeURIComponent(activeSessionId)}` : "";
          return JSON.stringify(
            await apiRequest<LiveCoachSnapshotResponse>(`/v1/coach/live-snapshot${query}`),
          );
        },
      },
      onConnect: () => {
        if (!mountedRef.current || !shouldRunRef.current) return;
        connectedAtRef.current = Date.now();
        reconnectAttemptRef.current = 0;
        setError("");
        setState("listening");
        armElevenLabsResponseTimer();
      },
      onModeChange: ({ mode }) => {
        if (mountedRef.current && shouldRunRef.current) {
          setState(mode === "speaking" ? "speaking" : "listening");
        }
      },
      onMessage: ({ role, message }) => {
        if (!mountedRef.current || !message.trim()) return;
        if (role === "user") {
          userTurnRef.current = message.trim();
          coachTurnRef.current = "";
          setCoachCaption("");
          setUserCaption(userTurnRef.current);
          armElevenLabsResponseTimer();
          return;
        }
        clearElevenLabsResponseTimer();
        coachTurnRef.current = message.trim();
        setUserCaption("");
        setCoachCaption(coachTurnRef.current);
        void saveCompletedTurn();
      },
      onAudio: (base64Audio) => {
        clearElevenLabsResponseTimer();
        const avatarClient = avatarClientRef.current;
        if (!avatarClient || !avatarReadyRef.current) return;
        avatarClient.sendAudioData(pcmForAvatar(base64Audio, "audio/pcm;rate=16000"));
      },
      onError: (message) => {
        if (mountedRef.current && shouldRunRef.current) setError(message);
      },
      onDisconnect: (details) => {
        if (!mountedRef.current || !shouldRunRef.current || details.reason === "user") return;
        clearElevenLabsResponseTimer();
        elevenLabsConversationRef.current = null;
        scheduleReconnect("The ElevenLabs coach connection ended unexpectedly.");
      },
    });
    if (!shouldRunRef.current) {
      await conversation.endSession();
      return;
    }
    elevenLabsConversationRef.current = conversation;
    conversation.setVolume({ volume: avatarReadyRef.current ? 0 : 1 });
    const pendingMovement = pendingMovementSignalRef.current;
    if (pendingMovement) {
      conversation.sendContextualUpdate(movementSignalText(pendingMovement));
      pendingMovementSignalRef.current = null;
    }
  }

  async function startGeminiFallback() {
    voiceProviderRef.current = "gemini";
    setConnectionStage("microphone");
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Live voice needs microphone and Web Audio support in this browser.");
    }
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    await audioContext.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (!shouldRunRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;
    await connectSocket(false);
  }

  async function connectSocket(reconnecting: boolean) {
    if (!shouldRunRef.current) return;
    setConnectionStage(reconnecting ? "reconnecting" : "authorizing");
    try {
      const credentials = await apiRequest<LiveCoachTokenResponse>("/v1/coach/live-token", {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({ threadId, sessionId: activeSessionId ?? undefined }),
      });
      if (!shouldRunRef.current) return;
      setConnectionStage("socket");
      const resumeHandle = resumptionHandleRef.current;
      const endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
      const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(credentials.token)}`);
      socket.binaryType = "arraybuffer";
      setupCompleteRef.current = false;
      socketRef.current = socket;
      socket.onopen = () => {
        if (!shouldRunRef.current || socketRef.current !== socket) return;
        setConnectionStage("setup");
        setupTimerRef.current = setTimeout(() => {
          if (setupCompleteRef.current || socketRef.current !== socket) return;
          retireSocket(socket, "Setup timed out");
          scheduleReconnect("The voice provider did not finish setup.");
        }, 15_000);
        socket.send(JSON.stringify({
          setup: {
            model: `models/${credentials.model.replace(/^models\//, "")}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: credentials.voiceName } },
              },
              thinkingConfig: { thinkingLevel: "LOW" },
            },
            historyConfig: { initialHistoryInClientContent: true },
            contextWindowCompression: { slidingWindow: {} },
            sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{
              functionDeclarations: [{
                name: "get_live_workout_snapshot",
                description: "Get the member's latest active workout, logged sets, readiness, plan, and movement feedback before giving time-sensitive guidance.",
                parameters: { type: "OBJECT", properties: {} },
              }],
            }],
          },
        }));
      };
      socket.onmessage = (event) => {
        void decodeLiveServerMessage<LiveServerMessage>(event.data as string | Blob | ArrayBuffer)
          .then((message) => {
            if (!shouldRunRef.current || socketRef.current !== socket) return;
            handleServerMessage(
              message,
              socket,
              credentials.initialHistory ?? [],
              Boolean(resumeHandle),
            );
          })
          .catch((cause) => {
            console.error("Unable to decode a Gemini Live response", cause);
            retireSocket(socket, "Unreadable response");
            scheduleReconnect("The live coach received an unreadable response.");
          });
      };
      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        retireSocket(socket, "Connection error");
        scheduleReconnect("The live coach connection failed.");
      };
      socket.onclose = () => {
        if (socketRef.current !== socket || !shouldRunRef.current) return;
        retireSocket(socket, "Connection closed");
        scheduleReconnect("The live coach connection ended unexpectedly.");
      };
    } catch (cause) {
      if (!shouldRunRef.current) return;
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      scheduleReconnect(timedOut
        ? "Authorizing live voice took too long."
        : cause instanceof Error ? cause.message : "Live voice could not connect.");
    }
  }

  async function startSession() {
    if (state !== "idle" && state !== "error") return;
    setError("");
    setAvatarIssue("");
    setUserCaption("");
    setCoachCaption("");
    setupCompleteRef.current = false;
    resumptionHandleRef.current = null;
    reconnectAttemptRef.current = 0;
    connectedAtRef.current = 0;
    shouldRunRef.current = true;
    setConnectionStage("microphone");
    setState("connecting");
    try {
      try {
        await connectElevenLabs(false);
      } catch (cause) {
        if (!shouldRunRef.current) return;
        setAvatarIssue(cause instanceof Error
          ? `${cause.message} Using the backup live voice.`
          : "ElevenLabs is unavailable. Using the backup live voice.");
        await startGeminiFallback();
      }
      if (shouldRunRef.current) void connectAvatar();
    } catch (cause) {
      closeResources();
      const timedOut = cause instanceof DOMException && cause.name === "TimeoutError";
      setError(timedOut
        ? "Authorizing live voice took too long. Check that the backend is running, then retry."
        : cause instanceof Error ? cause.message : "Live voice could not start.");
      setState("error");
    }
  }

  function endSession() {
    setState("ending");
    closeResources();
    setState("idle");
  }

  const isSessionActive = state !== "idle" && state !== "error";
  const activeCaption = state === "speaking" ? coachCaption : userCaption || coachCaption;
  const captionOwner = state === "speaking" || (!userCaption && coachCaption) ? "YOUR COACH" : "YOU";

  return (
    <div className="live-voice-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && state === "idle") onClose();
    }}>
          <section className={`live-voice-panel is-${state}`} role="dialog" aria-modal="true" aria-labelledby="live-voice-title">
            <header>
              <div>
                <small>LIVE COACHING SESSION</small>
                <h2 id="live-voice-title">Your coach is here.</h2>
              </div>
              <button type="button" onClick={() => { endSession(); onClose(); }} aria-label="Close live voice">×</button>
            </header>
            <div className="live-coach-stage">
              <div className={`live-coach-presence is-${state}`}>
                <div className="live-coach-light" aria-hidden="true"><i /><i /></div>
                {/* The avatar video is muted; the live transcript is rendered beside it. */}
                <video
                  ref={avatarVideoRef}
                  className={`live-coach-video${avatarReady ? " is-ready" : ""}`}
                  autoPlay
                  muted
                  playsInline
                  aria-hidden="true"
                />
                {/* The provider audio is transcribed into the visible live-caption region. */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio ref={avatarAudioRef} autoPlay />
                {!avatarReady && (
                  <Image
                    className="live-coach-avatar"
                    src="/coach/forge-coach-avatar.webp"
                    alt=""
                    width={682}
                    height={1024}
                    priority
                    sizes="(max-width: 767px) 70vw, 25rem"
                  />
                )}
                <LiveCoachCamera
                  sessionId={activeSessionId}
                  onMovement={setCameraMovementSignal}
                />
                <div className="live-coach-presence-badge" aria-hidden="true">
                  <i /> {state === "speaking" ? "Speaking" : state === "listening" ? "Listening" : "Ready"}
                </div>
              </div>
              <div className="live-coach-session">
                <p className="live-voice-state" aria-live="polite">
                  <i aria-hidden="true" />
                  {sessionLabel(state, connectionStage)}
                </p>
                <div className="live-coach-utterance" aria-live="polite">
                  <small>{activeCaption ? captionOwner : "PRIVATE, PERSONALIZED COACHING"}</small>
                  <p>{activeCaption || "I know your profile, plan, and recent conversations. When you're ready, let's talk."}</p>
                  {state === "speaking" && (
                    <span className="live-coach-speaking-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  )}
                </div>
                {!isSessionActive && (
                  <ul className="live-coach-context" aria-label="Live coach capabilities">
                    <li><i>✓</i><span><b>Remembers you</b>Your goals and past coaching stay in context.</span></li>
                    <li><i>✓</i><span><b>Workout aware</b>Receives live form cues from your tracker.</span></li>
                    <li><i>✓</i><span><b>Natural conversation</b>Speak freely and interrupt at any time.</span></li>
                  </ul>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                {avatarIssue && <p className="live-avatar-notice" role="status">{avatarIssue}</p>}
                <div className="live-voice-controls">
                  {state === "idle" || state === "error" ? (
                    <button className="live-voice-primary" type="button" onClick={() => void startSession()}>
                      <span className="live-voice-button-icon" aria-hidden="true">●</span> Talk to your coach
                    </button>
                  ) : (
                    <button className="live-voice-end" type="button" onClick={endSession}>
                      Finish coaching session
                    </button>
                  )}
                </div>
              </div>
            </div>
            <footer className="live-voice-privacy"><span aria-hidden="true">◆</span> Audio streams only during this session. Workout camera frames stay on your device; only compact rep summaries are saved.</footer>
          </section>
    </div>
  );
}
