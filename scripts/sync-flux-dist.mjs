import { cp, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const from = resolve(repoRoot, "vendor/flux/web/dist");
const rootGenerated = ["index.html", "index.js", "colors", "fonts"];
const existingRootFiles = await readdir(repoRoot);
const staleWasm = existingRootFiles.filter((entry) => entry.endsWith(".module.wasm"));

await Promise.all(
  [...rootGenerated, ...staleWasm].map((entry) =>
    rm(resolve(repoRoot, entry), { recursive: true, force: true }),
  ),
);

for (const entry of await readdir(from)) {
  if (entry === "CNAME") continue;
  await cp(resolve(from, entry), resolve(repoRoot, entry), { recursive: true });
}
