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
  external: ["@google/genai", "pdfkit"],
  noExternal: ["@fitai/ai", "@fitai/contracts"],
});
