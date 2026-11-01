import { open } from "../lib.mjs";

export async function run(browser) {
  const notes = [];
  let ok = true;
  const fail = (m) => {
    ok = false;
    notes.push("FAIL " + m);
  };
  const { page, context } = await open(browser, { js: false });
  await page.waitForTimeout(500);

  const links = await page.evaluate(() =>
    [...document.querySelectorAll("#hub-window a[href]")].map((a) => a.getAttribute("href")),
  );
  const want = [
    "https://akl.dev/",
    "#factory",
    "https://factorio.com/",
    "https://16384.dev/",
    "https://rfc.akl.run/",
    "https://enchilada.dev/",
  ];
  const got = [...new Set(links)].sort();
  if (JSON.stringify(got) !== JSON.stringify([...want].sort()))
    fail(`#hub-window hrefs ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
  else notes.push(`${want.length} hub hrefs match`);

  for (const sel of [".hint", "[data-readout]", ".status"]) {
    const state = await page.evaluate((s) => {
      const els = [...document.querySelectorAll(s)];
      if (!els.length) return "absent";
      return els.every((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return (
          e.hidden || cs.display === "none" || cs.visibility === "hidden" || (r.width === 0 && r.height === 0)
        );
      })
        ? "hidden"
        : "visible";
    }, sel);
    if (state === "visible") fail(`${sel} is visible with JS off`);
    else if (state === "absent") fail(`${sel} is absent from the markup`);
    notes.push(`${sel}: ${state}`);
  }
  await context.close();
  return { ok, notes };
}
