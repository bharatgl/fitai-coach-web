import type { ExerciseVideo, ExperienceLevel } from "@fitai/contracts";

export type EquipmentKey =
  | "dumbbells"
  | "resistance_bands"
  | "bench"
  | "barbell"
  | "pull_up_bar";

export type ExerciseDefinition = {
  id: string;
  name: string;
  movement: "squat" | "hinge" | "push" | "pull" | "lunge" | "core" | "carry";
  requiredEquipment: EquipmentKey[];
  minimumLevel: ExperienceLevel;
  guidance: string;
  video: ExerciseVideo;
};

function youtube(videoId: string, title: string, channel: string): ExerciseVideo {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`Invalid YouTube video ID: ${videoId}`);
  }
  return { provider: "youtube", videoId, title, channel };
}

export const exerciseCatalog: ExerciseDefinition[] = [
  { id: "bodyweight-squat", name: "Bodyweight Squat", movement: "squat", requiredEquipment: [], minimumLevel: "beginner", guidance: "Use a comfortable, pain-free depth and keep the whole foot grounded.", video: youtube("aclHkVaku9U", "Squats for Beginners", "BowFlex") },
  { id: "reverse-lunge", name: "Reverse Lunge", movement: "lunge", requiredEquipment: [], minimumLevel: "beginner", guidance: "Step back far enough to keep the front foot stable; use support if balance is limited.", video: youtube("QOVaHwm-Q6U", "Lunges for Beginners", "BowFlex") },
  { id: "glute-bridge", name: "Glute Bridge", movement: "hinge", requiredEquipment: [], minimumLevel: "beginner", guidance: "Finish by squeezing the glutes without arching the lower back.", video: youtube("wPM8icPu6H8", "How to do a glute bridge", "Well+Good") },
  { id: "wall-push-up", name: "Wall Push-Up", movement: "push", requiredEquipment: [], minimumLevel: "beginner", guidance: "Keep a straight line from head to heels and control the lowering phase.", video: youtube("EgU3CbtQTlw", "How to do wall push-ups", "Wahoo Fitness") },
  { id: "push-up", name: "Push-Up", movement: "push", requiredEquipment: [], minimumLevel: "intermediate", guidance: "Keep the ribs stacked and stop before technique deteriorates.", video: youtube("IODxDxX7oi4", "The perfect push-up", "Calisthenicmovement") },
  { id: "bird-dog", name: "Bird Dog", movement: "core", requiredEquipment: [], minimumLevel: "beginner", guidance: "Reach long while keeping the pelvis level and the lower back quiet.", video: youtube("wiFNA3sqjCA", "How to do the bird dog", "Howcast") },
  { id: "dead-bug", name: "Dead Bug", movement: "core", requiredEquipment: [], minimumLevel: "beginner", guidance: "Only extend as far as you can while maintaining gentle abdominal tension.", video: youtube("4XLEnwUr1d8", "Dead bug exercise guide", "Bodybuilding.com") },
  { id: "forearm-plank", name: "Forearm Plank", movement: "core", requiredEquipment: [], minimumLevel: "beginner", guidance: "Use short, high-quality holds and breathe normally.", video: youtube("ASdvN_XEl_c", "Planks for beginners", "BowFlex") },
  { id: "calf-raise", name: "Standing Calf Raise", movement: "carry", requiredEquipment: [], minimumLevel: "beginner", guidance: "Pause at the top and lower under control while using support for balance.", video: youtube("gwLzBJYoWlI", "How to do calf raises", "LIVESTRONG.COM") },
  { id: "goblet-squat", name: "Goblet Squat", movement: "squat", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Hold one dumbbell close to the chest and choose a load that preserves depth and control.", video: youtube("MeIiIdhvXT4", "How to goblet squat", "ScottHermanFitness") },
  { id: "dumbbell-rdl", name: "Dumbbell Romanian Deadlift", movement: "hinge", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Push the hips back with soft knees and keep the dumbbells close to the legs.", video: youtube("hQgFixeXdZo", "Dumbbell Romanian deadlift technique", "J2FIT Strength & Conditioning") },
  { id: "dumbbell-floor-press", name: "Dumbbell Floor Press", movement: "push", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Pause gently when the upper arms meet the floor and keep wrists stacked.", video: youtube("uUGDRwge4F8", "How to dumbbell floor press", "ScottHermanFitness") },
  { id: "one-arm-dumbbell-row", name: "One-Arm Dumbbell Row", movement: "pull", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Brace the torso and draw the elbow toward the back pocket without rotating.", video: youtube("pYcpY20QaE8", "How to single-arm dumbbell row", "ScottHermanFitness") },
  { id: "dumbbell-overhead-press", name: "Dumbbell Overhead Press", movement: "push", requiredEquipment: ["dumbbells"], minimumLevel: "intermediate", guidance: "Keep ribs stacked and use a neutral grip if it feels more comfortable.", video: youtube("qEwKCR5JCog", "How to dumbbell shoulder press", "ScottHermanFitness") },
  { id: "dumbbell-split-squat", name: "Dumbbell Split Squat", movement: "lunge", requiredEquipment: ["dumbbells"], minimumLevel: "intermediate", guidance: "Use a stable stance and descend vertically within a pain-free range.", video: youtube("2C-uNgKwPLE", "How to Bulgarian split squat", "ScottHermanFitness") },
  { id: "band-row", name: "Resistance-Band Row", movement: "pull", requiredEquipment: ["resistance_bands"], minimumLevel: "beginner", guidance: "Anchor the band securely and finish with the shoulder blades moving naturally.", video: youtube("WkNuYbWZ8g8", "Beginner resistance-band row", "Whats Up Dude") },
  { id: "band-pallof-press", name: "Band Pallof Press", movement: "core", requiredEquipment: ["resistance_bands"], minimumLevel: "beginner", guidance: "Resist rotation and keep the band anchor secure.", video: youtube("AH_QZLm_0-s", "Standing band-resisted Pallof press", "Breathing to Heal") },
  { id: "band-pull-apart", name: "Band Pull-Apart", movement: "pull", requiredEquipment: ["resistance_bands"], minimumLevel: "beginner", guidance: "Use light tension and move through a controlled, comfortable shoulder range.", video: youtube("SuvO4TBwSu4", "Band pull-apart", "Movement Physio") },
  { id: "bench-incline-push-up", name: "Incline Push-Up", movement: "push", requiredEquipment: ["bench"], minimumLevel: "beginner", guidance: "Use a stable surface and maintain a straight body line.", video: youtube("cfns5VDVVvk", "How to do an incline push-up", "Train With Adby") },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", movement: "push", requiredEquipment: ["dumbbells", "bench"], minimumLevel: "intermediate", guidance: "Keep feet grounded and stop the descent at a comfortable shoulder depth.", video: youtube("VmB1G1K7v94", "How to dumbbell chest press", "ScottHermanFitness") },
  { id: "assisted-pull-up", name: "Assisted Pull-Up", movement: "pull", requiredEquipment: ["pull_up_bar", "resistance_bands"], minimumLevel: "intermediate", guidance: "Use enough assistance to keep every repetition controlled.", video: youtube("7yqudG7vnow", "Resistance-band pull-up progression", "WOD Nation") },
  { id: "barbell-back-squat", name: "Barbell Back Squat", movement: "squat", requiredEquipment: ["barbell"], minimumLevel: "intermediate", guidance: "Use safeties and a load that preserves bracing and consistent depth.", video: youtube("SW_C1A-rejs", "How to deep barbell back squat", "ScottHermanFitness") },
  { id: "barbell-deadlift", name: "Barbell Deadlift", movement: "hinge", requiredEquipment: ["barbell"], minimumLevel: "intermediate", guidance: "Brace before lifting and keep the bar close; stop if position cannot be maintained.", video: youtube("op9kVnSso6Q", "The deadlift", "CrossFit") },
  { id: "farmer-carry", name: "Dumbbell Farmer Carry", movement: "carry", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Walk tall with short controlled steps and enough space to turn safely.", video: youtube("rt17lmnaLSM", "Farmer's walk", "Buff Dudes Workouts") },
];

export function exerciseVideoForId(exerciseId: string): ExerciseVideo | null {
  return exerciseCatalog.find((exercise) => exercise.id === exerciseId)?.video ?? null;
}

const levelRank: Record<ExperienceLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

export function normalizeEquipment(equipment: string[]): Set<EquipmentKey> {
  const normalized = equipment.join(" ").toLowerCase();
  const available = new Set<EquipmentKey>();
  const fullGym = /full gym|commercial gym|gym access|all equipment/.test(normalized);

  if (fullGym || /dumbbell|\bdbs?\b/.test(normalized)) available.add("dumbbells");
  if (fullGym || /resistance band|exercise band|\bbands?\b/.test(normalized)) available.add("resistance_bands");
  if (fullGym || /bench|box|stable chair/.test(normalized)) available.add("bench");
  if (fullGym || /barbell|power rack|squat rack/.test(normalized)) available.add("barbell");
  if (fullGym || /pull.?up bar|chin.?up bar/.test(normalized)) available.add("pull_up_bar");
  return available;
}

export function availableExercises(
  equipment: string[],
  level: ExperienceLevel,
): ExerciseDefinition[] {
  const available = normalizeEquipment(equipment);
  return exerciseCatalog.filter(
    (exercise) =>
      levelRank[exercise.minimumLevel] <= levelRank[level] &&
      exercise.requiredEquipment.every((item) => available.has(item)),
  );
}
