import { hasMapgen, open, SKIP_MAPGEN } from "../lib.mjs";

export async function run(browser) {
  const { page, context } = await open(browser, { w: 1440, h: 900, dpr: 2 });
  try {
    if (!(await hasMapgen(page))) return SKIP_MAPGEN;
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.__mapgen.resetPerf());
    await page.waitForTimeout(10000);
    const p = await page.evaluate(() => window.__mapgen.perf());
    const ok = p.avg <= 8 && p.firstDraw < 150 && p.chunks <= 256;
    return { ok, notes: [`avg ${p.avg} (<=8), firstDraw ${p.firstDraw} (<150), chunks ${p.chunks} (<=256)`] };
  } finally {
    await context.close();
  }
}
