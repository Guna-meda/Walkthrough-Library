// tsup hardcodes ".d.cts" for CJS declaration files (and ".cjs" in their
// cross-file import specifiers) when the package has "type": "module". The
// published exports map expects plain ".d.ts" paths under dist/cjs, so rename
// the files and rewrite their internal ".cjs" specifiers to ".js" to match.
const fs = require("fs");
const path = require("path");

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith(".d.cts")) {
      const fixed = fs.readFileSync(full, "utf8").replace(/\.cjs(['"])/g, ".js$1");
      const renamed = full.slice(0, -".d.cts".length) + ".d.ts";
      fs.writeFileSync(renamed, fixed);
      fs.unlinkSync(full);
    }
  }
}

walk(path.join(__dirname, "..", "dist", "cjs"));
