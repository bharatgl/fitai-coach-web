export type PosePoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type MovementProfile = {
  kind: "squat" | "lunge" | "push_up" | "hinge";
  label: string;
  joint: "knee" | "elbow" | "hip";
  confidenceThreshold: number;
  extendedAngle: number;
  flexedAngle: number;
  descentHysteresisDegrees: number;
  minimumRangeOfMotionDegrees: number;
  minimumRepDurationMs: number;
  maximumRepDurationMs: number;
  trackingLossResetMs: number;
  sides: [[number, number, number], [number, number, number]];
};

export type RepDetection = {
  repNumber: number;
  durationMs: number;
  rangeOfMotionDegrees: number;
  confidence: number;
};

export type MovementRuntimeSettings = {
  captureWidth: number;
  captureHeight: number;
  captureFrameRate: number;
  inferenceIntervalMs: number;
};

export function movementRuntimeSettings({
  compactDevice = false,
  saveData = false,
}: {
  compactDevice?: boolean;
  saveData?: boolean;
} = {}): MovementRuntimeSettings {
  if (saveData) {
    return {
      captureWidth: 480,
      captureHeight: 360,
      captureFrameRate: 10,
      inferenceIntervalMs: 160,
    };
  }
  if (compactDevice) {
    return {
      captureWidth: 640,
      captureHeight: 480,
      captureFrameRate: 12,
      inferenceIntervalMs: 125,
    };
  }
  return {
    captureWidth: 960,
    captureHeight: 540,
    captureFrameRate: 15,
    inferenceIntervalMs: 100,
  };
}

const PROFILES: Record<MovementProfile["kind"], MovementProfile> = {
  squat: {
    kind: "squat",
    label: "Squat",
    joint: "knee",
    confidenceThreshold: 0.65,
    extendedAngle: 158,
    flexedAngle: 112,
    descentHysteresisDegrees: 8,
    minimumRangeOfMotionDegrees: 40,
    minimumRepDurationMs: 400,
    maximumRepDurationMs: 20_000,
    trackingLossResetMs: 1_500,
    sides: [[23, 25, 27], [24, 26, 28]],
  },
  lunge: {
    kind: "lunge",
    label: "Lunge",
    joint: "knee",
    confidenceThreshold: 0.65,
    extendedAngle: 158,
    flexedAngle: 112,
    descentHysteresisDegrees: 8,
    minimumRangeOfMotionDegrees: 40,
    minimumRepDurationMs: 400,
    maximumRepDurationMs: 20_000,
    trackingLossResetMs: 1_500,
    sides: [[23, 25, 27], [24, 26, 28]],
  },
  push_up: {
    kind: "push_up",
    label: "Push-up",
    joint: "elbow",
    confidenceThreshold: 0.65,
    extendedAngle: 155,
    flexedAngle: 100,
    descentHysteresisDegrees: 8,
    minimumRangeOfMotionDegrees: 45,
    minimumRepDurationMs: 400,
    maximumRepDurationMs: 20_000,
    trackingLossResetMs: 1_500,
    sides: [[11, 13, 15], [12, 14, 16]],
  },
  hinge: {
    kind: "hinge",
    label: "Hip hinge",
    joint: "hip",
    confidenceThreshold: 0.65,
    extendedAngle: 158,
    flexedAngle: 115,
    descentHysteresisDegrees: 8,
    minimumRangeOfMotionDegrees: 35,
    minimumRepDurationMs: 400,
    maximumRepDurationMs: 20_000,
    trackingLossResetMs: 1_500,
    sides: [[11, 23, 25], [12, 24, 26]],
  },
};

const EXERCISE_PROFILES: Record<string, MovementProfile["kind"]> = {
  "bodyweight-squat": "squat",
  "goblet-squat": "squat",
  "barbell-back-squat": "squat",
  "reverse-lunge": "lunge",
  "dumbbell-split-squat": "lunge",
  "wall-push-up": "push_up",
  "push-up": "push_up",
  "bench-incline-push-up": "push_up",
  "glute-bridge": "hinge",
  "dumbbell-rdl": "hinge",
  "barbell-deadlift": "hinge",
};

export function movementProfileForExercise(exerciseId: string, name: string) {
  const reviewedKind = EXERCISE_PROFILES[exerciseId.toLowerCase()];
  if (reviewedKind) return PROFILES[reviewedKind];

  // Preserve support for older stored plans whose IDs predate the reviewed catalog.
  const value = `${exerciseId} ${name}`.toLowerCase();
  if (value.includes("lunge") || value.includes("split-squat")) return PROFILES.lunge;
  if (value.includes("squat")) return PROFILES.squat;
  if (value.includes("push-up") || value.includes("pushup")) return PROFILES.push_up;
  if (
    value.includes("deadlift") ||
    value.includes("hinge") ||
    value.includes("glute-bridge") ||
    value.includes("glute bridge") ||
    value.includes("romanian") ||
    value.includes("good-morning")
  ) return PROFILES.hinge;
  return null;
}

function angleAt(a: PosePoint, b: PosePoint, c: PosePoint) {
  const first = Math.atan2(a.y - b.y, a.x - b.x);
  const second = Math.atan2(c.y - b.y, c.x - b.x);
  let degrees = Math.abs((first - second) * 180 / Math.PI);
  if (degrees > 180) degrees = 360 - degrees;
  return degrees;
}

function measureSide(
  landmarks: PosePoint[],
  [aIndex, bIndex, cIndex]: [number, number, number],
) {
  const a = landmarks[aIndex];
  const b = landmarks[bIndex];
  const c = landmarks[cIndex];
  if (!a || !b || !c) return null;
  return {
    angle: angleAt(a, b, c),
    confidence: Math.min(a.visibility ?? 1, b.visibility ?? 1, c.visibility ?? 1),
  };
}

export function measureMovement(profile: MovementProfile, landmarks: PosePoint[]) {
  const measurements = profile.sides
    .map((side) => measureSide(landmarks, side))
    .filter((measurement): measurement is NonNullable<typeof measurement> => measurement !== null)
    .sort((a, b) => b.confidence - a.confidence);
  return measurements[0] ?? null;
}

export function createRepDetector(
  profile: MovementProfile,
  confidenceThreshold = profile.confidenceThreshold,
) {
  type Phase = "seeking_extension" | "extended" | "descending" | "flexed";
  let phase: Phase = "seeking_extension";
  let repNumber = 0;
  let repStartedAt = 0;
  let peakAngle = 0;
  let minimumAngle = 180;
  let minimumConfidence = 1;
  let lastReliableAt = 0;

  function resetCycle(nextPhase: Phase = "seeking_extension") {
    phase = nextPhase;
    repStartedAt = 0;
    peakAngle = 0;
    minimumAngle = 180;
    minimumConfidence = 1;
  }

  return {
    ingest(landmarks: PosePoint[], timestampMs: number): RepDetection | null {
      const measurement = measureMovement(profile, landmarks);
      if (!measurement || measurement.confidence < confidenceThreshold) {
        if (
          lastReliableAt > 0 &&
          timestampMs - lastReliableAt > profile.trackingLossResetMs
        ) resetCycle();
        return null;
      }
      lastReliableAt = timestampMs;
      const { angle, confidence } = measurement;

      if (phase === "seeking_extension") {
        if (angle >= profile.extendedAngle) {
          phase = "extended";
          peakAngle = angle;
        }
        return null;
      }

      if (phase === "extended") {
        peakAngle = Math.max(peakAngle, angle);
        if (angle < profile.extendedAngle - profile.descentHysteresisDegrees) {
          phase = "descending";
          repStartedAt = timestampMs;
          minimumAngle = angle;
          minimumConfidence = confidence;
        }
        return null;
      }

      minimumAngle = Math.min(minimumAngle, angle);
      minimumConfidence = Math.min(minimumConfidence, confidence);

      if (phase === "descending") {
        if (angle <= profile.flexedAngle) phase = "flexed";
        else if (angle >= profile.extendedAngle) resetCycle("extended");
        return null;
      }

      if (angle < profile.extendedAngle) return null;
      const durationMs = Math.round(timestampMs - repStartedAt);
      const rangeOfMotionDegrees = Number((peakAngle - minimumAngle).toFixed(1));
      const repConfidence = Number(minimumConfidence.toFixed(3));
      const valid =
        durationMs >= profile.minimumRepDurationMs &&
        durationMs <= profile.maximumRepDurationMs &&
        rangeOfMotionDegrees >= profile.minimumRangeOfMotionDegrees;
      resetCycle("extended");
      if (!valid) return null;
      repNumber += 1;
      return {
        repNumber,
        durationMs,
        rangeOfMotionDegrees,
        confidence: repConfidence,
      };
    },
    reset() {
      repNumber = 0;
      lastReliableAt = 0;
      resetCycle();
    },
  };
}
