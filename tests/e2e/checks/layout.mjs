import { open, FACTORY } from "../lib.mjs";

const SIZES = [
  [1440, 900],
  [1200, 720],
  [800, 700],
  [520, 800],
  [390, 844],
  [360, 640],
];

/** Per .project-desc: its text, rendered line-box count and whether it fits one line. */
function measureDescs() {
  return [...document.querySelectorAll(".project-desc")].map((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
    const tops = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
    const oneLine = cs.whiteSpace === "nowrap" ? el.scrollHeight <= 1.5 * lh : tops.size <= 1;
    return {
      text: el.textContent.trim().slice(0, 40),
      oneLine,
      lines: Math.round(el.scrollHeight / lh),
      rfc: !!el.closest('a[href*="rfc.akl.run"]'),
      wraps: cs.whiteSpace !== "nowrap" && el.scrollWidth <= el.clientWidth + 1,
    };
  });
}

const FACTORY_SIZES = [
  [1440, 900],
  [1200, 720],
  [1180, 700],
  [1100, 700],
  [1000, 700],
  [800, 700],
  [390, 844],
];

/** Factory-mode chrome: rects of the prod line, journal panel, comment lines and readout. */
function measureFactory() {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null; // display:none
    return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  return {
    prod: box(".prod"),
    status: box(".status"),
    readout: box("[data-readout]"),
    comments: [...document.querySelectorAll("[data-log] .log-line--comment")].map((el) => ({
      text: el.textContent.slice(0, 30),
      cut: el.scrollWidth > el.clientWidth + 1,
    })),
    iw: window.innerWidth,
  };
}
const hit = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

async function factoryChecks(browser, fail, notes) {
  for (const [w, h] of FACTORY_SIZES) {
    const { page, context } = await open(browser, { w, h, url: FACTORY });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(measureFactory);
    const tag = `factory ${w}x${h}`;
    if (m.prod) {
      if (m.prod.x < 0 || m.prod.r > m.iw)
        fail(`${tag}: .prod outside the viewport (${m.prod.x}..${m.prod.r})`);
    }
    if (m.comments.length !== 2) fail(`${tag}: ${m.comments.length} comment lines, want 2`);
    if (m.status) {
      for (const c of m.comments) if (c.cut) fail(`${tag}: comment line truncated: "${c.text}"`);
      if (hit(m.status, m.readout)) fail(`${tag}: journal overlaps the readout`);
      if (m.status.x < 0 || m.status.r > m.iw) fail(`${tag}: journal outside the viewport`);
    } else fail(`${tag}: journal missing`);
    if (w === 390) {
      if (!m.readout || m.readout.h < 44) fail(`${tag}: readout hit area ${m.readout?.h}px tall, want >= 44`);
    }
    notes.push(
      `${tag}: prod ${m.prod ? Math.round(m.prod.w) + "px" : "hidden"}, journal ${m.status ? Math.round(m.status.w) + "px" : "hidden"}, readout h ${m.readout ? Math.round(m.readout.h) : "-"}`,
    );
    await context.close();
  }
  // the hint follows the input type, not the width: keyboard devices only, none on touch
  for (const [touch, want, w] of [
    [false, "hint--desktop", 390],
    [true, null, 1200],
  ]) {
    const { page, context } = await open(browser, { w, h: 844, touch });
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll(".hint")]
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => el.className),
    );
    if (want ? shown.length !== 1 || !shown[0].includes(want) : shown.length !== 0)
      fail(`hint at ${w}px touch=${touch}: shown [${shown}], want ${want ? "only " + want : "none"}`);
    notes.push(`hint touch=${touch} ${w}px: ${shown.join(",")}`);
    await context.close();
  }
}

export async function run(browser) {
  const notes = [];
  let ok = true;
  const fail = (m) => {
    ok = false;
    notes.push("FAIL " + m);
  };
  await factoryChecks(browser, fail, notes);
  for (const [w, h] of SIZES) {
    const { page, context } = await open(browser, { w, h });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const descs = await page.evaluate(measureDescs);
    if (!descs.length) fail(`${w}x${h}: no .project-desc elements`);
    if (w >= 800) {
      for (const d of descs) if (!d.oneLine) fail(`${w}x${h}: "${d.text}" wraps (${d.lines} lines)`);
    }
    // <= 760: descriptions wrap instead of ellipsising. rfc.akl.run (101 chars, the longest) is 2 lines
    // while the text column is wide enough (520) and 3 lines at 390 (the column is 268 px; real
    // Newsreader metrics, and the handoff target hub-phone-390.png wraps it to 3 lines too).
    if (w <= 760) {
      for (const d of descs) if (!d.wraps) fail(`${w}x${h}: "${d.text}" does not wrap`);
      const r = descs.find((d) => d.rfc);
      const want = w === 520 ? 2 : w === 390 ? 3 : null;
      if (!r) fail(`${w}: rfc.akl.run description not found`);
      else if (want && r.lines !== want)
        fail(`${w}: rfc.akl.run description has ${r.lines} lines, want ${want}`);
    }
    const sw = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    if (sw.sw > sw.iw) fail(`${w}x${h}: scrollWidth ${sw.sw} > innerWidth ${sw.iw}`);
    if (w === 360) {
      const m = await page.evaluate(() => {
        const hub = document.querySelector(".hub");
        return {
          top: hub ? hub.getBoundingClientRect().top : null,
          sh: document.documentElement.scrollHeight,
          ih: window.innerHeight,
          scrolls: (() => {
            const before = window.scrollY;
            window.scrollTo(0, 99999);
            const moved = window.scrollY > before;
            window.scrollTo(0, 0);
            return moved;
          })(),
        };
      });
      if (m.top === null) fail("360x640: .hub missing");
      else if (m.top < 0) fail(`360x640: .hub top ${m.top} < 0`);
      if (m.sh > m.ih && !m.scrolls) fail(`360x640: content ${m.sh} > ${m.ih} but document does not scroll`);
      notes.push(`360x640: hub top ${m.top}, scrollHeight ${m.sh}, scrolls ${m.scrolls}`);
    }
    notes.push(`${w}x${h}: ${descs.length} descs, scrollWidth ${sw.sw}/${sw.iw}`);
    await context.close();
  }
  return { ok, notes };
}
