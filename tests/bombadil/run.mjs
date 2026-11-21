// Property-based browser check of the built site. Run after `npm run build`.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../e2e/serve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(ROOT, "dist");
if (!existsSync(path.join(dist, "index.html")))
  throw new Error("dist/index.html missing: run npm run build first");
mkdirSync(path.join(ROOT, "tmp"), { recursive: true });

function chromiumPath() {
  if (process.env.CHROME || process.env.CHROMIUM) return process.env.CHROME || process.env.CHROMIUM;
  const cache = path.join(ROOT, "tmp/.chromium-path");
  if (existsSync(cache)) {
    const p = readFileSync(cache, "utf8").trim();
    if (p && existsSync(p)) return p;
  }
  const out = execFileSync("nix", ["build", "--no-link", "--print-out-paths", "nixpkgs#chromium"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")[0];
  const p = out + "/bin/chromium";
  mkdirSync(path.dirname(cache), { recursive: true });
  writeFileSync(cache, p);
  return p;
}

const server = await serve(dist, 0);
try {
  const traceDir = await mkdtemp(path.join(ROOT, "tmp/bombadil-"));
  const args = [
    "browser",
    "test",
    "--headless",
    "--no-sandbox",
    "--exit-on-violation",
    "--time-limit",
    process.env.BOMBADIL_TIME_LIMIT || "30s",
    "--output-path",
    path.join(traceDir, "trace.bin"),
    `http://127.0.0.1:${server.port}/?seed=0xa85b492a&time=day`,
    "tests/bombadil/specification.ts",
  ];
  console.log(`Bombadil trace: ${traceDir}/trace.bin`);
  const child = spawn(path.join(ROOT, "node_modules/.bin/bombadil"), args, {
    cwd: ROOT,
    env: { ...process.env, CHROME: chromiumPath() },
    stdio: "inherit",
  });
  const [code, signal] = await once(child, "exit");
  if (signal) throw new Error(`Bombadil stopped by ${signal}`);
  process.exitCode = code;
} finally {
  await server.close();
}
