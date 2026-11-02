import { FACTORY, hasMapgen, open, SKIP_MAPGEN } from "../lib.mjs";

const REQ = [
  [180, /^train .* arrived/],
  [180, /^signal .* → (red|green)$/],
  [180, /^belt .* backed up/],
  [180, /^blueprint placed/],
  [180, /biters inbound/],
  [180, /biters repelled/],
  [180, /^radar .* charted/],
  [180, /^research (started|complete)/],
  [360, /^rocket launched/],
];

export async function run(browser) {
  // factory mode never idle-pauses (hub mode does, after 120 s). The world is pinned to the permalink
  // seed, which holds every site; ~1 world in 10 has no raid pair in reach (world.test.ts bounds that).
  const { page, context } = await open(browser, { w: 1440, h: 900, url: `${FACTORY}?seed=0xa85b492a` });
  try {
    if (!(await hasMapgen(page))) return SKIP_MAPGEN;
    await page.evaluate(() => {
      window.__mapgen.speed = 1;
    });
    const first = new Map();
    const t0 = Date.now();
    while (Date.now() - t0 < 360_000) {
      await page.waitForTimeout(5000);
      const t = (Date.now() - t0) / 1000;
      const events = await page.evaluate(() =>
        (window.__mapgen.events ?? []).map((e) =>
          typeof e === "string" ? e : (e.text ?? e.msg ?? String(e)),
        ),
      );
      for (const [, re] of REQ) if (!first.has(re) && events.some((e) => re.test(e))) first.set(re, t);
    }
    let ok = true;
    const notes = [];
    for (const [by, re] of REQ) {
      const t = first.get(re);
      const pass = t !== undefined && t <= by + 5;
      if (!pass) ok = false;
      notes.push(
        `${pass ? "ok  " : "FAIL"} ${re} first seen ${t === undefined ? "never" : t.toFixed(0) + "s"} (by ${by}s)`,
      );
    }
    return { ok, notes };
  } finally {
    await context.close();
  }
}
