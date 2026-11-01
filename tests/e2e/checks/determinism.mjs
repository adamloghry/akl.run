import { BASE, hasMapgen, open, SKIP_MAPGEN } from "../lib.mjs";

export async function run(browser) {
  const notes = [];
  let ok = true;
  const a = await open(browser, { reduced: true, url: BASE + "?seed=0xa85b492a&time=day" });
  try {
    if (!(await hasMapgen(a.page))) return SKIP_MAPGEN;
    await a.page.waitForTimeout(2000);

    const same = await a.page.evaluate(() => {
      const M = window.__mapgen;
      const w1 = new M.World(0xa85b492a);
      const w2 = new M.World(0xa85b492a);
      if (!Number.isFinite(M.cam?.x) || !Number.isFinite(M.cam?.y)) return { camBad: true };
      const c0 = { cx: Math.floor(M.cam.x / 192), cy: Math.floor(M.cam.y / 192) };
      const bad = [];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const cx = c0.cx + dx;
          const cy = c0.cy + dy;
          const d1 = w1.paintRaster(cx, cy).raster.data;
          const d2 = w2.paintRaster(cx, cy).raster.data;
          n++;
          if (d1.length !== d2.length || d1.some((v, i) => v !== d2[i])) bad.push(`${cx},${cy}`);
        }
      return { n, bad };
    });
    if (same.camBad) {
      return { ok: false, notes: ["FAIL __mapgen.cam.x/y is not a finite number; cannot pick chunks"] };
    }
    if (same.bad.length) {
      ok = false;
      notes.push(`FAIL paintRaster differs for chunks ${same.bad.join(" ")}`);
    } else notes.push(`paintRaster identical for ${same.n} chunks`);

    const s1 = await a.page.locator("#map").screenshot();
    const b = await open(browser, { reduced: true, url: BASE + "?seed=0xa85b492a&time=day" });
    let s2;
    try {
      await b.page.waitForTimeout(2000);
      s2 = await b.page.locator("#map").screenshot();
    } finally {
      await b.context.close();
    }
    if (!s1.equals(s2)) {
      ok = false;
      notes.push("FAIL #map screenshots differ between two loads");
    } else notes.push("#map screenshots identical");
  } finally {
    await a.context.close();
  }
  return { ok, notes };
}
