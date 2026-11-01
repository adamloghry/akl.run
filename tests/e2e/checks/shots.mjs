import { BASE, FACTORY, open, shot } from "../lib.mjs";

const SIZES = [
  [1440, 900],
  [1200, 720],
  [800, 700],
  [390, 844],
  [360, 640],
];

export async function run(browser) {
  const notes = [];
  const take = async (name, opts, act) => {
    const { page, context } = await open(browser, opts);
    try {
      await page.waitForTimeout(opts.wait ?? 2500);
      if (act) await act(page);
      notes.push(await shot(page, name));
    } finally {
      await context.close();
    }
  };
  for (const [w, h] of SIZES) await take(`hub-${w}x${h}`, { w, h });
  await take("factory-m", { w: 1440, h: 900 }, async (page) => {
    await page.keyboard.press("m");
    await page.waitForTimeout(12000);
  });
  await take("night-factory", { w: 1440, h: 900, url: BASE + "?time=night#factory" });
  await take("touch-readout", { w: 390, h: 844, touch: true }, async (page) => {
    const readout = page.locator("[data-readout]");
    if (await readout.isVisible()) {
      await readout.tap();
      await page.waitForTimeout(1500);
    } else notes.push("note: [data-readout] not visible, tap skipped");
  });
  await take("factory-host", { w: 1440, h: 900, url: FACTORY, wait: 3000 });
  return { ok: true, notes };
}
