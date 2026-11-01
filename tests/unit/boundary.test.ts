import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}
const banned = [/\bMath\.random\b/, /\bDate\b/, /\bperformance\b/, /from\s+["'][^"']*core\/(rng|clock)["']/];

describe("determinism boundary", () => {
  it("world/** never touches ephemeral randomness or clocks", () => {
    for (const f of files("src/factory/world")) {
      const src = readFileSync(f, "utf8");
      for (const re of banned) expect(re.test(src), `${f} matches ${re}`).toBe(false);
    }
  });
});
