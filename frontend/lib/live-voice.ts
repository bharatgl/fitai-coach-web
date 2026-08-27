export async function decodeLiveServerMessage<T>(data: string | Blob | ArrayBuffer) {
  let json: string;
  if (typeof data === "string") {
    json = data;
  } else if (data instanceof Blob) {
    json = await data.text();
  } else {
    json = new TextDecoder().decode(data);
  }
  return JSON.parse(json) as T;
}

export type LiveMovementSignal = {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  repNumber: number;
  durationMs: number;
  rangeOfMotionDegrees: number;
  confidence: number;
  cue: string;
  requiresCorrection: boolean;
};

export function shouldSendMovementSignal(signal: LiveMovementSignal) {
  return signal.requiresCorrection || signal.repNumber === 1 || signal.repNumber % 3 === 0;
}

export function movementSignalText(signal: LiveMovementSignal) {
  return [
    "ON_DEVICE_MOVEMENT_UPDATE",
    `Exercise: ${signal.exerciseName}`,
    `Rep: ${signal.repNumber}`,
    `Duration: ${signal.durationMs}ms`,
    `Tracked range of motion: ${signal.rangeOfMotionDegrees} degrees`,
    `Pose confidence: ${signal.confidence}`,
    `Local tracker cue: ${signal.cue}`,
    "Give one short spoken correction only if useful. Do not claim to see raw video.",
  ].join("\n");
}
