// ESM load hook so node --test can import the React UI (.jsx) without a
// bundler: esbuild (already a vite dependency) transforms JSX to ESM.
// `import.meta.env.DEV` is defined false — the SSR smoke test exercises
// the shipped render path, and effects/fetch never run server-side.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { transformSync } = require("esbuild");

export async function load(url, context, next) {
  if (!url.endsWith(".jsx")) return next(url, context);
  const source = await readFile(fileURLToPath(url), "utf8");
  const out = transformSync(source, {
    loader: "jsx",
    format: "esm",
    jsx: "automatic",
    define: { "import.meta.env.DEV": "false" },
  });
  return { format: "module", source: out.code, shortCircuit: true };
}
