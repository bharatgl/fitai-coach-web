"use client";

import type {
  CoachThreadDetail,
  LiveCoachSnapshotResponse,
  LiveCoachTokenResponse,
} from "@fitai/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";

type LiveState = "idle" | "connecting" | "listening" | "speaking" | "ending" | "error";

type LiveVoiceCoachProps = {
  threadId: string;
  activeSessionId: string | null;
  onThreadUpdate: (detail: CoachThreadDetail) => void;
  onClose: () => void;
};

type FunctionCall = { id?: string; name?: string; args?: Record<string, unknown> };
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

function sessionLabel(state: LiveState) {
  if (state === "connecting") return "Connecting securely…";
  if (state === "listening") return "Listening — speak naturally";
  if (state === "speaking") return "Coach is speaking — interrupt anytime";
  if (state === "ending") return "Ending session…";
  if (state === "error") return "Session needs attention";
  return "Ready for a real-time conversation";
}

export function LiveVoiceCoach({
  threadId,
  activeSessionId,
  onThreadUpdate,
  onClose,
}: LiveVoiceCoachProps) {
  const [state, setState] = useState<LiveState>("idle");
  const [error, setError] = useState("");
  const [userCaption, setUserCaption] = useState("");
  const [coachCaption, setCoachCaption] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const captureSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextPlaybackAtRef = useRef(0);
  const userTurnRef = useRef("");
  const coachTurnRef = useRef("");
  const mountedRef = useRef(true);

  const clearPlayback = useCallback(() => {
    for (const source of outputSourcesRef.current) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    outputSourcesRef.current.clear();
    nextPlaybackAtRef.current = audioContextRef.current?.currentTime ?? 0;
  }, []);

  const closeResources = useCallback(() => {
    captureNodeRef.current?.disconnect();
    captureSourceRef.current?.disconnect();
    captureNodeRef.current = null;
    captureSourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearPlayback();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Session ended");
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
  }, [clearPlayback]);

  useEffect(() => () => {
    mountedRef.current = false;
    closeResources();
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

  function playAudio(data: string, mimeType?: string) {
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

  function handleServerMessage(message: LiveServerMessage) {
    if (message.setupComplete) {
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
      clearPlayback();
      setState("listening");
    }
    const inputText = content?.inputTranscription?.text;
    if (inputText) {
      userTurnRef.current += inputText;
      setUserCaption(userTurnRef.current.trim());
    }
    const outputText = content?.outputTranscription?.text;
    if (outputText) {
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
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        realtimeInput: {
          audio: { data: bytesToBase64(event.data), mimeType: "audio/pcm;rate=16000" },
        },
      }));
    };
    captureSourceRef.current = source;
    captureNodeRef.current = capture;
  }

  async function startSession() {
    if (state !== "idle" && state !== "error") return;
    setError("");
    setUserCaption("");
    setCoachCaption("");
    setState("connecting");
    try {
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
      streamRef.current = stream;
      const credentials = await apiRequest<LiveCoachTokenResponse>("/v1/coach/live-token", {
        method: "POST",
        body: JSON.stringify({ threadId, sessionId: activeSessionId ?? undefined }),
      });
      const endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
      const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(credentials.token)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({
          setup: {
            model: `models/${credentials.model.replace(/^models\//, "")}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
              },
              thinkingConfig: { thinkingLevel: "LOW" },
            },
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
        try { handleServerMessage(JSON.parse(String(event.data)) as LiveServerMessage); } catch { /* ignore malformed provider events */ }
      };
      socket.onerror = () => {
        setError("The live coach connection failed. Check the API model access and try again.");
        setState("error");
      };
      socket.onclose = (event) => {
        if (!mountedRef.current) return;
        if (event.code !== 1000) {
          setError("The live coach session ended unexpectedly. You can reconnect without losing chat history.");
          setState("error");
        }
      };
    } catch (cause) {
      closeResources();
      setError(cause instanceof Error ? cause.message : "Live voice could not start.");
      setState("error");
    }
  }

  function endSession() {
    setState("ending");
    closeResources();
    setState("idle");
  }

  return (
    <div className="live-voice-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && state === "idle") onClose();
    }}>
          <section className="live-voice-panel" role="dialog" aria-modal="true" aria-labelledby="live-voice-title">
            <header>
              <div>
                <small>REAL-TIME COACH</small>
                <h2 id="live-voice-title">Talk naturally. Interrupt anytime.</h2>
              </div>
              <button type="button" onClick={() => { endSession(); onClose(); }} aria-label="Close live voice">×</button>
            </header>
            <div className={`live-voice-orb is-${state}`} aria-hidden="true">
              <span /><span /><b>AI</b>
            </div>
            <p className="live-voice-state" aria-live="polite">{sessionLabel(state)}</p>
            <div className="live-voice-captions" aria-live="polite">
              {userCaption && <p><small>YOU</small>{userCaption}</p>}
              {coachCaption && <p><small>COACH</small>{coachCaption}</p>}
              {!userCaption && !coachCaption && <p className="is-empty">Your conversation stays in this coach thread.</p>}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="live-voice-controls">
              {state === "idle" || state === "error" ? (
                <button className="live-voice-primary" type="button" onClick={() => void startSession()}>
                  <span aria-hidden="true">●</span> Start live session
                </button>
              ) : (
                <button className="live-voice-end" type="button" onClick={endSession}>
                  End session
                </button>
              )}
            </div>
            <small className="live-voice-privacy">Microphone audio streams only while this session is active. Audio is not stored by ForgeFit.</small>
          </section>
    </div>
  );
}
