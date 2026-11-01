import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * URL for a file under `public/`, with a cache-busting `?v=` query.
 *
 * These assets are kept out of Astro's pipeline (stable URLs and bytes for
 * the golden check), so they get no hashed filenames, and Cloudflare serves
 * them with a multi-day cache lifetime. Without the query a returning visitor
 * could get new HTML with a stale script or stylesheet. The version is the
 * first 8 hex digits of the file's SHA-256, computed at build time: it changes
 * exactly when the file's bytes do, with nothing to bump by hand.
 *
 * @param path - path under `public/`, without a leading slash
 */
export function asset(path: string): string {
  const hash = createHash("sha256")
    .update(readFileSync(join(process.cwd(), "public", path)))
    .digest("hex")
    .slice(0, 8);
  return `/${path}?v=${hash}`;
}
