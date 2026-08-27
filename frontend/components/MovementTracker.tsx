"use client";

import type {
  MovementEventSummary,
  RecordMovementEventsResponse,
  WorkoutSession,
} from "@fitai/contracts";
import { Button, Card, Eyebrow } from "@fitai/ui";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  createRepDetector,
  measureMovement,
  movementProfileForExercise,
  movementRuntimeSettings,
} from "@/lib/movement-tracking";
import type { LiveMovementSignal } from "@/lib/live-voice";

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type TrackerStatus = "off" | "starting" | "tracking" | "error";

export function MovementTracker({
  session,
  onLiveMovement,
}: {
  session: WorkoutSession;
  onLiveMovement?: (signal: LiveMovementSignal) => void;
}) {
  const supportedExercises = useMemo(
    () => session.exercises.flatMap((exercise) => {
      const profile = movementProfileForExercise(exercise.exerciseId, exercise.name);
      return profile ? [{ exercise, profile }] : [];
    }),
    [session.exercises],
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState(
    supportedExercises[0]?.exercise.exerciseId ?? "",
  );
  const selected = supportedExercises.find(
    ({ exercise }) => exercise.exerciseId === selectedExerciseId,
  ) ?? supportedExercises[0] ?? null;
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<TrackerStatus>("off");
  const [feedback, setFeedback] = useState("Camera is off.");
  const [trackedReps, setTrackedReps] = useState(0);
  const [lastRom, setLastRom] = useState<number | null>(null);
  const [syncError, setSyncError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEventsRef = useRef<MovementEventSummary[]>([]);
  const flushingRef = useRef(false);
  const disposedRef = useRef(false);
  const runIdRef = useRef(0);

  const flushMovementEvents = useCallback(async () => {
    if (flushingRef.current || pendingEventsRef.current.length === 0) return;
    flushingRef.current = true;
    const events = pendingEventsRef.current.splice(0, 25);
    try {
      await apiRequest<RecordMovementEventsResponse>(
        `/v1/workout-sessions/${session.id}/movement-events`,
        { method: "POST", body: JSON.stringify({ events }) },
      );
      if (!disposedRef.current) setSyncError("");
    } catch (cause) {
      pendingEventsRef.current.unshift(...events);
      if (!disposedRef.current) {
        setSyncError(cause instanceof Error ? cause.message : "Movement summaries could not sync");
      }
    } finally {
      flushingRef.current = false;
      if (
        !disposedRef.current &&
        pendingEventsRef.current.length > 0 &&
        flushTimerRef.current === null
      ) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null;
          void flushMovementEvents();
        }, 2_000);
      }
    }
  }, [session.id]);

  const queueMovementEvent = useCallback((event: MovementEventSummary) => {
    pendingEventsRef.current.push(event);
    if (flushTimerRef.current === null) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        void flushMovementEvents();
      }, 1_000);
    }
  }, [flushMovementEvents]);

  const stopCamera = useCallback((flush = true, updateUi = true) => {
    runIdRef.current += 1;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    const context = canvasRef.current?.getContext("2d");
    if (context && canvasRef.current) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (updateUi) {
      setStatus("off");
      setFeedback("Camera is off.");
    }
    if (flush) void flushMovementEvents();
  }, [flushMovementEvents]);

  useEffect(() => {
    disposedRef.current = false;
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden" && streamRef.current) stopCamera();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      disposedRef.current = true;
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      stopCamera(true, false);
    };
  }, [stopCamera]);

  async function startCamera() {
    if (!selected || !consented || session.status !== "active") return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setStatus("starting");
    setFeedback("Loading the on-device pose model…");
    setSyncError("");
    setTrackedReps(0);
    setLastRom(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported by this browser");
      }
      const compactDevice = window.matchMedia(
        "(max-width: 800px), (pointer: coarse)",
      ).matches;
      const connection = (navigator as Navigator & {
        connection?: { saveData?: boolean };
      }).connection;
      const runtime = movementRuntimeSettings({
        compactDevice,
        saveData: connection?.saveData === true,
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: runtime.captureWidth },
          height: { ideal: runtime.captureHeight },
          frameRate: {
            ideal: runtime.captureFrameRate,
            max: runtime.captureFrameRate,
          },
        },
      });
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error("Camera preview could not be initialized");
      video.srcObject = stream;
      await video.play();

      const { DrawingUtils, FilesetResolver, PoseLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: selected.profile.confidenceThreshold,
        minPosePresenceConfidence: selected.profile.confidenceThreshold,
        minTrackingConfidence: selected.profile.confidenceThreshold,
        outputSegmentationMasks: false,
      });
      if (runId !== runIdRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      const detector = createRepDetector(selected.profile);
      const drawing = new DrawingUtils(canvas.getContext("2d")!);
      let lastInferenceAt = 0;
      let lastVideoTime = -1;

      setStatus("tracking");
      setFeedback("Step into frame and show your full movement path.");

      const detect = (timestamp: number) => {
        if (
          runId !== runIdRef.current ||
          !landmarkerRef.current ||
          !streamRef.current
        ) return;
        animationFrameRef.current = requestAnimationFrame(detect);
        if (
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.currentTime === lastVideoTime ||
          timestamp - lastInferenceAt < runtime.inferenceIntervalMs
        ) return;
        lastInferenceAt = timestamp;
        lastVideoTime = video.currentTime;
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const result = landmarker.detectForVideo(video, performance.now());
        const landmarks = result.landmarks[0];
        const context = canvas.getContext("2d")!;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (!landmarks) {
          setFeedback("No pose found — step back and improve the lighting.");
          return;
        }
        drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
          color: "#9ff5dc",
          lineWidth: 3,
        });
        drawing.drawLandmarks(landmarks, { color: "#ffffff", radius: 2 });

        const measurement = measureMovement(selected.profile, landmarks);
        if (
          !measurement ||
          measurement.confidence < selected.profile.confidenceThreshold
        ) {
          setFeedback("Tracking confidence is low — keep the working joints visible.");
          return;
        }
        if (measurement.angle >= selected.profile.extendedAngle) {
          setFeedback("Ready — begin the next rep with control.");
        } else if (measurement.angle <= selected.profile.flexedAngle) {
          setFeedback("Range reached — return smoothly to the start.");
        } else {
          setFeedback("Movement detected — keep the tempo controlled.");
        }

        const rep = detector.ingest(landmarks, timestamp);
        if (!rep) return;
        setTrackedReps(rep.repNumber);
        setLastRom(rep.rangeOfMotionDegrees);
        const rangeNeedsAttention =
          rep.rangeOfMotionDegrees < selected.profile.minimumRangeOfMotionDegrees + 8;
        const tempoNeedsAttention = rep.durationMs < 900;
        const confidenceNeedsAttention =
          rep.confidence < selected.profile.confidenceThreshold + 0.08;
        const cue = rangeNeedsAttention
          ? "Use a little more controlled range on the next rep."
          : tempoNeedsAttention
            ? "Slow the next rep down and keep control."
            : confidenceNeedsAttention
              ? "Keep the working joints fully visible to the camera."
              : "Tracked range and tempo look consistent.";
        onLiveMovement?.({
          id: crypto.randomUUID(),
          sessionId: session.id,
          exerciseId: selected.exercise.exerciseId,
          exerciseName: selected.exercise.name,
          repNumber: rep.repNumber,
          durationMs: rep.durationMs,
          rangeOfMotionDegrees: rep.rangeOfMotionDegrees,
          confidence: rep.confidence,
          cue,
          requiresCorrection:
            rangeNeedsAttention || tempoNeedsAttention || confidenceNeedsAttention,
        });
        queueMovementEvent({
          clientEventId: crypto.randomUUID(),
          exerciseId: selected.exercise.exerciseId,
          repNumber: rep.repNumber,
          occurredAt: new Date().toISOString(),
          durationMs: rep.durationMs,
          rangeOfMotionDegrees: rep.rangeOfMotionDegrees,
          confidence: rep.confidence,
          source: "mediapipe_pose",
        });
      };
      animationFrameRef.current = requestAnimationFrame(detect);
    } catch (cause) {
      if (runId !== runIdRef.current) return;
      stopCamera(false);
      setStatus("error");
      const permissionDenied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setFeedback(
        permissionDenied
          ? "Camera permission was denied. Allow access in browser settings or keep logging sets manually."
          : cause instanceof Error
            ? cause.message
            : "Camera tracking could not start",
      );
    }
  }

  if (supportedExercises.length === 0) {
    return (
      <Card className="movement-tracker movement-tracker-empty" padding="md">
        <Eyebrow>On-device movement tracking</Eyebrow>
        <h2>No supported movement in this session</h2>
        <p>Camera tracking currently supports squats, lunges, push-ups, and hip hinges. Manual set logging remains available for every exercise.</p>
      </Card>
    );
  }

  const tracking = status === "tracking";
  return (
    <Card className="movement-tracker" padding="md">
      <div className="movement-tracker-copy">
        <Eyebrow>On-device movement tracking</Eyebrow>
        <h2>Private rep and range-of-motion feedback.</h2>
        <p>Camera frames and pose landmarks stay in this browser. forgefit.space receives only compact rep timing, confidence, and range-of-motion summaries.</p>
        <label className="movement-exercise-select">
          Exercise
          <select
            value={selected?.exercise.exerciseId ?? ""}
            disabled={status === "starting" || tracking}
            onChange={(event) => setSelectedExerciseId(event.target.value)}
          >
            {supportedExercises.map(({ exercise, profile }) => (
              <option value={exercise.exerciseId} key={exercise.exerciseId}>
                {exercise.name} · {profile.label} tracking
              </option>
            ))}
          </select>
        </label>
        <label className="camera-consent">
          <input
            type="checkbox"
            checked={consented}
            disabled={status === "starting" || tracking}
            onChange={(event) => setConsented(event.target.checked)}
          />
          <span>I consent to local camera processing by MediaPipe. Frames are not uploaded; MediaPipe may process non-frame performance and usage metrics.</span>
        </label>
        <div className="movement-tracker-actions">
          {tracking ? (
            <Button variant="secondary" onClick={() => stopCamera()}>Turn camera off</Button>
          ) : (
            <Button
              busy={status === "starting"}
              disabled={!consented || session.status !== "active" || status === "starting"}
              onClick={() => void startCamera()}
            >
              {status === "starting" ? "Starting camera…" : "Start camera tracking"}
            </Button>
          )}
          {session.status !== "active" && <small>Resume the workout to enable tracking.</small>}
        </div>
      </div>
      <div className="movement-camera" data-state={status}>
        <video ref={videoRef} muted playsInline aria-label="Local movement tracking camera preview" />
        <canvas ref={canvasRef} aria-hidden="true" />
        {!tracking && status !== "starting" && <span aria-hidden="true">◉</span>}
        <div className="movement-camera-status">
          <strong>{tracking ? `${trackedReps} reps tracked` : status === "error" ? "Camera unavailable" : "Camera off"}</strong>
          <small>{feedback}</small>
          {lastRom !== null && <small>Last detected ROM: {lastRom}°</small>}
          {syncError && <small className="movement-sync-error">Sync pending: {syncError}</small>}
        </div>
      </div>
    </Card>
  );
}
