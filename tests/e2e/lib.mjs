import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PORT = Number(process.env.PORT ?? 4329);
export const BASE = `http://akl.run:${PORT}/`;
export const FACTORY = `http://factory.akl.run:${PORT}/`;

export function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
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

export async function launch() {
  return chromium.launch({
    executablePath: chromiumPath(),
    args: [
      "--no-sandbox",
      `--host-resolver-rules=MAP akl.run 127.0.0.1:${PORT}, MAP factory.akl.run 127.0.0.1:${PORT}`,
    ],
  });
}

/** Open a page in a fresh context. Returns { page, context, logs, errors }. */
export async function open(
  browser,
  { w = 1440, h = 900, dpr = 1, reduced = false, js = true, url = BASE, init, touch = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dpr,
    reducedMotion: reduced ? "reduce" : "no-preference",
    javaScriptEnabled: js,
    hasTouch: touch,
  });
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => {
    logs.push(`[pageerror] ${e.message}`);
    errors.push(e.message);
  });
  if (init) await page.addInitScript(init);
  await page.goto(url, { waitUntil: "load" });
  return { page, context, logs, errors };
}

export async function shot(page, name) {
  const file = path.join(ROOT, "tmp/shots", `${name}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

export const hasMapgen = (page) =>
  page.evaluate(() => typeof window.__mapgen !== "undefined").catch(() => false);

export const SKIP_MAPGEN = { ok: true, notes: ["skipped: __mapgen missing"] };
