import { defineConfig } from "tsup";

const entry = [
  "src/index.ts",
  "src/ai-copy.ts",
  "src/react/useTour.ts",
  "src/types.ts",
  "src/player.ts",
  "src/capture.ts",
  "src/persistence.ts",
];

export default defineConfig([
  {
    entry,
    format: ["esm"],
    outDir: "dist/esm",
    dts: true,
    bundle: false,
    sourcemap: false,
    clean: false,
    outExtension: () => ({ js: ".js" }),
  },
  {
    entry,
    format: ["cjs"],
    outDir: "dist/cjs",
    dts: true,
    bundle: false,
    sourcemap: false,
    clean: false,
    outExtension: () => ({ js: ".js" }),
  },
]);
