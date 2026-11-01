import { existsSync } from "node:fs";
import path from "node:path";
import { serve } from "./serve.mjs";
import { launch, PORT, ROOT } from "./lib.mjs";

const ALL = ["shots", "csp", "layout", "a11y", "jsoff", "reduced", "perf", "determinism", "host"];
const OPT_IN = ["coverage"];

const dist = path.join(ROOT, "dist");
if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html missing: run `npm run build` first");
  process.exit(2);
}
const requested = process.argv.slice(2);
const names = requested.length ? requested : ALL;
for (const n of names) {
  if (![...ALL, ...OPT_IN].includes(n)) {
    console.error(`unknown check: ${n} (known: ${[...ALL, ...OPT_IN].join(", ")})`);
    process.exit(2);
  }
}

const server = await serve(dist, PORT);
const browser = await launch();
const rows = [];
for (const n of names) {
  const t0 = Date.now();
  let r;
  try {
    r = await (await import(`./checks/${n}.mjs`)).run(browser);
  } catch (e) {
    r = { ok: false, notes: [`crashed: ${e?.message ?? e}`] };
  }
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  rows.push({ n, r, s });
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${n}  (${s}s)`);
  for (const line of r.notes) console.log(`        ${line}`);
}
await browser.close();
await server.close();
console.log("\ncheck         result  time");
for (const { n, r, s } of rows) console.log(`${n.padEnd(13)} ${(r.ok ? "ok" : "FAIL").padEnd(7)} ${s}s`);
process.exit(rows.every((x) => x.r.ok) ? 0 : 1);
