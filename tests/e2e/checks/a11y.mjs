import { open } from "../lib.mjs";

const ORDER = [
  "https://akl.dev/",
  "#factory",
  "https://factorio.com/",
  "https://16384.dev/",
  "https://rfc.akl.run/",
  "https://enchilada.dev/",
];

const describe = () => {
  const a = document.activeElement;
  if (!a || a === document.body) return "body";
  if (a.hasAttribute("data-readout")) return "readout";
  if (a.tagName === "A") {
    const href = a.getAttribute("href");
    return href.startsWith("#") ? href : new URL(href, location.href).href;
  }
  return a.tagName.toLowerCase();
};

export async function run(browser) {
  const notes = [];
  let ok = true;
  const fail = (m) => {
    ok = false;
    notes.push("FAIL " + m);
  };
  const { page, context } = await open(browser, { w: 1440, h: 900 });
  await page.waitForTimeout(1000);

  const seen = [];
  for (let i = 0; i < ORDER.length + 1; i++) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(describe));
  }
  const want = [...ORDER, "readout"];
  const wantNorm = want.map((x) => x);
  if (JSON.stringify(seen) !== JSON.stringify(wantNorm)) {
    fail(`tab order\n          got  ${JSON.stringify(seen)}\n          want ${JSON.stringify(wantNorm)}`);
  } else notes.push("tab order ok");

  const cls = () => page.evaluate(() => document.documentElement.classList.contains("factory"));
  const active = (sel) => page.evaluate((s) => document.activeElement?.matches(s) ?? false, sel);

  await page.evaluate(() => document.querySelector("[data-minimize]")?.focus());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  if (!(await cls())) fail("Enter on [data-minimize] did not set html.factory");
  if (!(await active("[data-readout]"))) fail("after minimize, activeElement is not [data-readout]");

  await page.keyboard.press("m");
  await page.waitForTimeout(800);
  if (await cls()) fail("m did not restore the hub");
  await page.keyboard.press("m");
  await page.waitForTimeout(800);
  if (!(await cls())) fail("m did not minimize");

  const sup = () => page.evaluate(() => document.documentElement.classList.contains("superminimized"));
  await page.evaluate(() => document.querySelector("[data-log] a")?.focus());
  await page.keyboard.press("s");
  await page.waitForTimeout(800);
  if (!(await sup())) fail("s did not superminimize");
  if (!(await active("[data-readout]"))) fail("after superminimize, activeElement is not [data-readout]");
  const jvis = await page.evaluate(
    () => getComputedStyle(document.querySelector("[data-journal]")).visibility,
  );
  if (jvis !== "hidden") fail(`superminimized journal visibility is ${jvis}`);
  await page.keyboard.press("s");
  await page.waitForTimeout(800);
  if (await sup()) fail("second s did not bring the journal back");

  await page.evaluate(() => document.querySelector("[data-readout]")?.focus());
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  if (await cls()) fail("Enter on [data-readout] did not restore the hub");
  if (!(await active("[data-readout]"))) fail("after restore, activeElement is not [data-readout]");

  await context.close();
  return { ok, notes };
}
