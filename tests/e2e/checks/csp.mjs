import { BASE, open } from "../lib.mjs";

const CSP = /Refused to|Content Security Policy/i;

export async function run(browser) {
  const notes = [];
  let ok = true;
  for (const [label, url] of [
    ["hub", BASE],
    ["factory", BASE + "#factory"],
  ]) {
    const { page, context, logs, errors } = await open(browser, { url });
    await page.waitForTimeout(2000);
    const bad = logs.filter((l) => CSP.test(l));
    if (bad.length) ok = false;
    if (errors.length) ok = false;
    notes.push(`${label}: ${bad.length} CSP messages, ${errors.length} page errors`);
    for (const l of [...bad, ...errors.map((e) => `[pageerror] ${e}`)]) notes.push(`  ${l}`);
    await context.close();
  }
  return { ok, notes };
}
