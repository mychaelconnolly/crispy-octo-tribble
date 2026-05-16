import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const from = resolve(repoRoot, "vendor/flux/web/dist");
const to = resolve(repoRoot, "public/flux");

await rm(to, { recursive: true, force: true });
await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
