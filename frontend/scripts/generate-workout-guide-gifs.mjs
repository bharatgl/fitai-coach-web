import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = resolve(frontendRoot, "data/workout-guide-exercises.json");
const publicRoot = resolve(frontendRoot, "public");
const data = JSON.parse(await readFile(dataPath, "utf8"));
data.schemaVersion = 2;

let completed = 0;
for (const exercise of data.exercises) {
  const sourceFrames = exercise.frames.map((path) => resolve(publicRoot, path.slice(1)));
  const animationPath = `/exercises/workout-guide/assets/${exercise.slug}/movement.gif`;
  const outputPath = resolve(publicRoot, animationPath.slice(1));

  await mkdir(dirname(outputPath), { recursive: true });
  await sharp(
    [sourceFrames[0], sourceFrames[1], sourceFrames[2], sourceFrames[1]],
    { join: { animated: true, across: 1 } },
  )
    .gif({
      colors: 32,
      delay: [700, 425, 700, 425],
      dither: 0.6,
      effort: 7,
      loop: 0,
    })
    .toFile(outputPath);

  exercise.animation = animationPath;
  completed += 1;
  if (completed % 50 === 0 || completed === data.exercises.length) {
    console.log(`Generated ${completed}/${data.exercises.length} exercise GIFs`);
  }
}

data.source.changes = "SVG artwork is unmodified; ForgeFit generated looping GIF previews by sequencing the three source frames.";
await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
