import { BASE, FACTORY, open } from "../lib.mjs";

const init = () => {
  document.addEventListener("DOMContentLoaded", () => {
    window.__boot = document.documentElement.classList.contains("factory");
  });
};
const isFactory = (page) => page.evaluate(() => document.documentElement.classList.contains("factory"));

export async function run(browser) {
  const notes = [];
  let ok = true;
  const fail = (m) => {
    ok = false;
    notes.push("FAIL " + m);
  };

  {
    const { page, context } = await open(browser, { url: FACTORY, init });
    const boot = await page.evaluate(() => window.__boot);
    if (boot !== true) fail(`factory host: html.factory at DOMContentLoaded was ${boot}`);
    const vis = await page.evaluate(() => {
      const el = document.getElementById("hub-window");
      return el ? getComputedStyle(el).visibility : "missing";
    });
    if (vis !== "hidden") fail(`factory host: #hub-window visibility is ${vis} at load`);
    await page.evaluate(() => document.querySelector("[data-readout]")?.focus());
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    if (await isFactory(page)) fail("factory host: Enter on [data-readout] did not show the hub");
    await context.close();
  }
  for (const [url, want] of [
    [BASE + "#factory", true],
    [BASE, false],
  ]) {
    const { page, context } = await open(browser, { url });
    const got = await isFactory(page);
    if (got !== want) fail(`${url}: html.factory is ${got}, want ${want}`);
    await context.close();
  }
  if (ok) notes.push("factory host, #factory and plain hub behave");
  return { ok, notes };
}
