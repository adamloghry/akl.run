import { hasMapgen, open, SKIP_MAPGEN } from "../lib.mjs";

export async function run(browser) {
  const { page, context } = await open(browser, { reduced: true });
  try {
    if (!(await hasMapgen(page))) return SKIP_MAPGEN;
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => ({
      reduced: window.__mapgen.state.reduced,
      frames: window.__mapgen.state.frames,
      comments: document.querySelectorAll("[data-log] .log-line--comment").length,
      lines: document.querySelectorAll("[data-log] .log-line:not(.log-line--comment)").length,
    }));
    const ok = m.reduced === true && m.frames <= 2 && m.comments === 2 && m.lines === 0;
    return { ok, notes: [JSON.stringify(m)] };
  } finally {
    await context.close();
  }
}
