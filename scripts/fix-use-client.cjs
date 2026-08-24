// tsup/esbuild's CJS output always injects "use strict"; as the literal first line
// of a compiled file, ahead of any directive already present in the source (ESM
// output has no such injection, so it's unaffected). That pushes our own
// "use client"; directive in src/react/useTour.ts to the second line in the CJS
// build, which Next.js's "use client" detection does not accept — it must be the
// first line. Normalize both compiled outputs so "use client"; is genuinely first,
// regardless of what esbuild does or changes in a future version.
const fs = require("fs");
const path = require("path");

const DIRECTIVE = '"use client";';

const targets = [
  path.join(__dirname, "..", "dist", "esm", "react", "useTour.js"),
  path.join(__dirname, "..", "dist", "cjs", "react", "useTour.js"),
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, "utf8");
  const withoutExistingDirective = original
    .split("\n")
    .filter((line) => line.trim() !== '"use client";' && line.trim() !== "'use client';")
    .join("\n");
  fs.writeFileSync(file, `${DIRECTIVE}\n${withoutExistingDirective}`);
}
