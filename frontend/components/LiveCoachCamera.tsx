"use client";

import type {
  MovementEventSummary,
  RecordMovementEventsResponse,
  LiveCoachSnapshotResponse,
} from "@fitai/contracts";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { LiveMovementSignal } from "@/lib/live-voice";
import {
  createRepDetector,
  measureMovement,
  movementProfileForExercise,
  movementRuntimeSettings,
  type MovementProfile,
} from "@/lib/movement-tracking";

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type CameraStatus = "off" | "starting" | "preview" | "tracking" | "error";
type TrackableExercise = {
  exerciseId: string;
  name: string;
  profile: MovementProfile;
};

function trackableExercises(snapshot: LiveCoachSnapshotResponse) {
  const training = snapshot.trainingContext as {
    activeSession?: { exercises?: Array<{ exerciseId?: unknown; name?: unknown }> } | null;
  };
  return (training.activeSession?.exercises ?? []).flatMap((exercise) => {
    if (typeof exercise.exerciseId !== "string" || typeof exercise.name !== "string") return [];
    const profile = movementProfileForExercise(exercise.exerciseId, exercise.name);
    return profile ? [{ exerciseId: exercise.exerciseId, name: exercise.name, profile }] : [];
  });
}

export function LiveCoachCamera({
  sessionId,
  onMovement,
}: {
  sessionId: string | null;
  onMovement: (signal: LiveMovementSignal) => void;
}) {
  const [status, setStatus] = useState<CameraStatus>("off");
  const [feedback, setFeedback] = useState("Camera is off.");
  const [exercises, setExercises] = useState<TrackableExercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [trackedReps, setTrackedReps] = useState(0);
  const [syncError, setSyncError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const runIdRef = useRef(0);

  const stopCamera = useCallback((updateUi = true) => {
    runIdRef.current += 1;
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    if (updateUi) {
      setStatus("off");
      setFeedback("Camera is off.");
      setTrackedReps(0);
    }
  }, []);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") stopCamera();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      stopCamera(false);
    };
  }, [stopCamera]);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    void apiRequest<LiveCoachSnapshotResponse>(
      `/v1/coach/live-snapshot?sessionId=${encodeURIComponent(sessionId)}`,
      { signal: controller.signal },
    ).then((snapshot) => {
      const supported = trackableExercises(snapshot);
      setExercises(supported);
      setSelectedExerciseId(supported[0]?.exerciseId ?? "");
    }).catch(() => {
      // Camera preview remains available if workout context briefly fails to load.
    });
    return () => controller.abort();
  }, [sessionId]);

  async function saveRep(exercise: TrackableExercise, rep: {
    repNumber: number;
    durationMs: number;
    rangeOfMotionDegrees: number;
    confidence: number;
  }) {
    if (!sessionId) return;
    const event: MovementEventSummary = {
      clientEventId: crypto.randomUUID(),
      exerciseId: exercise.exerciseId,
      repNumber: rep.repNumber,
      occurredAt: new Date().toISOString(),
      durationMs: rep.durationMs,
      rangeOfMotionDegrees: rep.rangeOfMotionDegrees,
      confidence: rep.confidence,
      source: "mediapipe_pose",
    };
    try {
      await apiRequest<RecordMovementEventsResponse>(
        `/v1/workout-sessions/${sessionId}/movement-events`,
        { method: "POST", body: JSON.stringify({ events: [event] }) },
      );
      setSyncError("");
    } catch {
      setSyncError("Rep summary sync is pending.");
    }
  }

  async function startCamera() {
    if (status === "starting" || status === "tracking" || status === "preview") return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setStatus("starting");
    setFeedback("Waiting for camera permission…");
    setSyncError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported by this browser.");
      }
      const compactDevice = window.matchMedia("(max-width: 800px), (pointer: coarse)").matches;
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
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
          frameRate: { ideal: runtime.captureFrameRate, max: runtime.captureFrameRate },
        },
      });
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error("Camera preview could not be initialized.");
      video.srcObject = stream;
      await video.play();

      const selected = exercises.find((exercise) => exercise.exerciseId === selectedExerciseId)
        ?? exercises[0];
      if (!sessionId || !selected) {
        setStatus("preview");
        setFeedback(sessionId
          ? "Camera is on. This workout has no supported movement for automatic rep tracking."
          : "Private preview is on. Start a workout to enable movement tracking.");
        return;
      }

      setFeedback("Loading on-device movement tracking…");
      const { DrawingUtils, FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
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
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Movement overlay could not be initialized.");
      const drawing = new DrawingUtils(context);
      let lastInferenceAt = 0;
      let lastVideoTime = -1;
      setStatus("tracking");
      setFeedback(`Tracking ${selected.name}. Keep your working joints visible.`);

      const detect = (timestamp: number) => {
        if (runId !== runIdRef.current || !landmarkerRef.current || !streamRef.current) return;
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
        const result = landmarkerRef.current.detectForVideo(video, performance.now());
        const landmarks = result.landmarks[0];
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
        if (!measurement || measurement.confidence < selected.profile.confidenceThreshold) {
          setFeedback("Keep your working joints visible to the camera.");
          return;
        }
        const rep = detector.ingest(landmarks, timestamp);
        if (!rep) return;
        setTrackedReps(rep.repNumber);
        const rangeNeedsAttention =
          rep.rangeOfMotionDegrees < selected.profile.minimumRangeOfMotionDegrees + 8;
        const tempoNeedsAttention = rep.durationMs < 900;
        const cue = rangeNeedsAttention
          ? "Use a little more controlled range on the next rep."
          : tempoNeedsAttention
            ? "Slow the next rep down and keep control."
            : "Tracked range and tempo look consistent.";
        setFeedback(cue);
        onMovement({
          id: crypto.randomUUID(),
          sessionId,
          exerciseId: selected.exerciseId,
          exerciseName: selected.name,
          repNumber: rep.repNumber,
          durationMs: rep.durationMs,
          rangeOfMotionDegrees: rep.rangeOfMotionDegrees,
          confidence: rep.confidence,
          cue,
          requiresCorrection: rangeNeedsAttention || tempoNeedsAttention,
        });
        void saveRep(selected, rep);
      };
      animationFrameRef.current = requestAnimationFrame(detect);
    } catch (cause) {
      if (runId !== runIdRef.current) return;
      stopCamera(false);
      setStatus("error");
      const permissionDenied = cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setFeedback(permissionDenied
        ? "Camera permission was denied. Allow camera access in browser settings and retry."
        : cause instanceof Error ? cause.message : "Camera could not start.");
    }
  }

  const cameraOn = status === "preview" || status === "tracking";
  return (
    <div className="live-workout-camera" data-state={status}>
      <video ref={videoRef} muted playsInline aria-label="Private workout camera preview" />
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="live-camera-controls">
        {exercises.length > 1 && !cameraOn && (
          <label>
            <span>Track</span>
            <select
              value={selectedExerciseId}
              onChange={(event) => setSelectedExerciseId(event.target.value)}
            >
              {exercises.map((exercise) => (
                <option key={exercise.exerciseId} value={exercise.exerciseId}>{exercise.name}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => cameraOn ? stopCamera() : void startCamera()}
          disabled={status === "starting"}
          aria-pressed={cameraOn}
        >
          <span aria-hidden="true">{cameraOn ? "■" : "●"}</span>
          {status === "starting" ? "Starting camera…" : cameraOn ? "Turn camera off" : "Turn camera on"}
        </button>
      </div>
      {(cameraOn || status === "error") && (
        <div className="live-camera-feedback" role="status">
          <strong>{status === "tracking" ? `${trackedReps} reps tracked` : status === "preview" ? "Private preview" : "Camera unavailable"}</strong>
          <small>{feedback}</small>
          {syncError && <small>{syncError}</small>}
        </div>
      )}
    </div>
  );
}
