import type { PoseLandmarkerOptions } from "@mediapipe/tasks-vision";

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const XNNPACK_STARTUP_INFO = "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";

export function isBenignMediaPipeStartupLog(args: unknown[]) {
  return args.length === 1 &&
    typeof args[0] === "string" &&
    args[0].trim() === XNNPACK_STARTUP_INFO;
}

export async function createPoseRuntime(options: Omit<PoseLandmarkerOptions, "baseOptions">) {
  const originalConsoleError = console.error;
  const filteredConsoleError = (...args: unknown[]) => {
    if (isBenignMediaPipeStartupLog(args)) return;
    Reflect.apply(originalConsoleError, console, args);
  };
  console.error = filteredConsoleError;
  try {
    const { DrawingUtils, FilesetResolver, PoseLandmarker } = await import(
      "@mediapipe/tasks-vision"
    );
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_PATH },
    });
    return { DrawingUtils, PoseLandmarker, landmarker };
  } finally {
    if (console.error === filteredConsoleError) console.error = originalConsoleError;
  }
}
