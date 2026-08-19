import type { ExperienceLevel } from "@fitai/contracts";

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
};

export const exerciseCatalog: ExerciseDefinition[] = [
  { id: "bodyweight-squat", name: "Bodyweight Squat", movement: "squat", requiredEquipment: [], minimumLevel: "beginner", guidance: "Use a comfortable, pain-free depth and keep the whole foot grounded." },
  { id: "reverse-lunge", name: "Reverse Lunge", movement: "lunge", requiredEquipment: [], minimumLevel: "beginner", guidance: "Step back far enough to keep the front foot stable; use support if balance is limited." },
  { id: "glute-bridge", name: "Glute Bridge", movement: "hinge", requiredEquipment: [], minimumLevel: "beginner", guidance: "Finish by squeezing the glutes without arching the lower back." },
  { id: "wall-push-up", name: "Wall Push-Up", movement: "push", requiredEquipment: [], minimumLevel: "beginner", guidance: "Keep a straight line from head to heels and control the lowering phase." },
  { id: "push-up", name: "Push-Up", movement: "push", requiredEquipment: [], minimumLevel: "intermediate", guidance: "Keep the ribs stacked and stop before technique deteriorates." },
  { id: "bird-dog", name: "Bird Dog", movement: "core", requiredEquipment: [], minimumLevel: "beginner", guidance: "Reach long while keeping the pelvis level and the lower back quiet." },
  { id: "dead-bug", name: "Dead Bug", movement: "core", requiredEquipment: [], minimumLevel: "beginner", guidance: "Only extend as far as you can while maintaining gentle abdominal tension." },
  { id: "forearm-plank", name: "Forearm Plank", movement: "core", requiredEquipment: [], minimumLevel: "beginner", guidance: "Use short, high-quality holds and breathe normally." },
  { id: "calf-raise", name: "Standing Calf Raise", movement: "carry", requiredEquipment: [], minimumLevel: "beginner", guidance: "Pause at the top and lower under control while using support for balance." },
  { id: "goblet-squat", name: "Goblet Squat", movement: "squat", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Hold one dumbbell close to the chest and choose a load that preserves depth and control." },
  { id: "dumbbell-rdl", name: "Dumbbell Romanian Deadlift", movement: "hinge", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Push the hips back with soft knees and keep the dumbbells close to the legs." },
  { id: "dumbbell-floor-press", name: "Dumbbell Floor Press", movement: "push", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Pause gently when the upper arms meet the floor and keep wrists stacked." },
  { id: "one-arm-dumbbell-row", name: "One-Arm Dumbbell Row", movement: "pull", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Brace the torso and draw the elbow toward the back pocket without rotating." },
  { id: "dumbbell-overhead-press", name: "Dumbbell Overhead Press", movement: "push", requiredEquipment: ["dumbbells"], minimumLevel: "intermediate", guidance: "Keep ribs stacked and use a neutral grip if it feels more comfortable." },
  { id: "dumbbell-split-squat", name: "Dumbbell Split Squat", movement: "lunge", requiredEquipment: ["dumbbells"], minimumLevel: "intermediate", guidance: "Use a stable stance and descend vertically within a pain-free range." },
  { id: "band-row", name: "Resistance-Band Row", movement: "pull", requiredEquipment: ["resistance_bands"], minimumLevel: "beginner", guidance: "Anchor the band securely and finish with the shoulder blades moving naturally." },
  { id: "band-pallof-press", name: "Band Pallof Press", movement: "core", requiredEquipment: ["resistance_bands"], minimumLevel: "beginner", guidance: "Resist rotation and keep the band anchor secure." },
  { id: "band-pull-apart", name: "Band Pull-Apart", movement: "pull", requiredEquipment: ["resistance_bands"], minimumLevel: "beginner", guidance: "Use light tension and move through a controlled, comfortable shoulder range." },
  { id: "bench-incline-push-up", name: "Incline Push-Up", movement: "push", requiredEquipment: ["bench"], minimumLevel: "beginner", guidance: "Use a stable surface and maintain a straight body line." },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", movement: "push", requiredEquipment: ["dumbbells", "bench"], minimumLevel: "intermediate", guidance: "Keep feet grounded and stop the descent at a comfortable shoulder depth." },
  { id: "assisted-pull-up", name: "Assisted Pull-Up", movement: "pull", requiredEquipment: ["pull_up_bar", "resistance_bands"], minimumLevel: "intermediate", guidance: "Use enough assistance to keep every repetition controlled." },
  { id: "barbell-back-squat", name: "Barbell Back Squat", movement: "squat", requiredEquipment: ["barbell"], minimumLevel: "intermediate", guidance: "Use safeties and a load that preserves bracing and consistent depth." },
  { id: "barbell-deadlift", name: "Barbell Deadlift", movement: "hinge", requiredEquipment: ["barbell"], minimumLevel: "intermediate", guidance: "Brace before lifting and keep the bar close; stop if position cannot be maintained." },
  { id: "farmer-carry", name: "Dumbbell Farmer Carry", movement: "carry", requiredEquipment: ["dumbbells"], minimumLevel: "beginner", guidance: "Walk tall with short controlled steps and enough space to turn safely." },
];

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
