import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly to silence the multi-lockfile warning.
  // Must stay the repo root (not this folder): walkthrough-lib is a symlinked
  // local dependency living outside this folder, and narrowing the root here
  // breaks Turbopack's resolution of its file-based exports (e.g. style.css).
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
