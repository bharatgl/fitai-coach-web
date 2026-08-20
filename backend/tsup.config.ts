import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  dts: false,
  minify: false,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  noExternal: ["@fitai/ai", "@fitai/contracts"],
});
