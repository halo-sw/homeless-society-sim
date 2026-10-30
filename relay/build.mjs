// Stage 23a: bundle the relay into a deployable folder (relay/dist).
// Run: node relay/build.mjs, then deploy relay/dist.
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(new URL("../web/package.json", import.meta.url));
const esbuild = require("esbuild");

await mkdir(new URL("./dist/api", import.meta.url), { recursive: true });

await esbuild.build({
  entryPoints: ["relay/api-entry.js"],
  outfile: "relay/dist/api/relay.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

await writeFile(
  new URL("./dist/package.json", import.meta.url),
  JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
);

await writeFile(
  new URL("./dist/vercel.json", import.meta.url),
  JSON.stringify({
    rewrites: [{ source: "/api/:path*", destination: "/api/relay?path=:path*" }],
    // VWorld refuses requests from outside Korea, so the function runs in Seoul.
    regions: ["icn1"],
    functions: { "api/relay.js": { maxDuration: 60 } },
  }, null, 2) + "\n",
);

await writeFile(
  new URL("./dist/index.html", import.meta.url),
  "Ithaca relay — API only.\n",
);

console.log("relay/dist ready");
