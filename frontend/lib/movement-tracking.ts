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
  extendedAngle: number;
  flexedAngle: number;
  sides: [[number, number, number], [number, number, number]];
};

export type RepDetection = {
  repNumber: number;
  durationMs: number;
  rangeOfMotionDegrees: number;
  confidence: number;
};

const PROFILES: Record<MovementProfile["kind"], MovementProfile> = {
  squat: {
    kind: "squat",
    label: "Squat",
    joint: "knee",
    extendedAngle: 158,
    flexedAngle: 112,
    sides: [[23, 25, 27], [24, 26, 28]],
  },
  lunge: {
    kind: "lunge",
    label: "Lunge",
    joint: "knee",
    extendedAngle: 158,
    flexedAngle: 112,
    sides: [[23, 25, 27], [24, 26, 28]],
  },
  push_up: {
    kind: "push_up",
    label: "Push-up",
    joint: "elbow",
    extendedAngle: 155,
    flexedAngle: 100,
    sides: [[11, 13, 15], [12, 14, 16]],
  },
  hinge: {
    kind: "hinge",
    label: "Hip hinge",
    joint: "hip",
    extendedAngle: 158,
    flexedAngle: 115,
    sides: [[11, 23, 25], [12, 24, 26]],
  },
};

export function movementProfileForExercise(exerciseId: string, name: string) {
  const value = `${exerciseId} ${name}`.toLowerCase();
  if (value.includes("squat")) return PROFILES.squat;
  if (value.includes("lunge") || value.includes("split-squat")) return PROFILES.lunge;
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
  confidenceThreshold = 0.65,
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
        if (lastReliableAt > 0 && timestampMs - lastReliableAt > 1_500) resetCycle();
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
        if (angle < profile.extendedAngle - 8) {
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
      const valid = durationMs >= 250 && durationMs <= 20_000 && rangeOfMotionDegrees >= 5;
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
