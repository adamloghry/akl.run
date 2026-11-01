import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// compressHTML: false — index.astro's source whitespace ships verbatim
// (golden/ pins it). inlineStylesheets: "never" and assetsInlineLimit: 0 —
// the CSP (style-src 'self', script-src 'self', no 'unsafe-inline') would
// silently block an inlined <style> or inline script, so Astro must always
// emit external files.
export default defineConfig({
  site: "https://akl.run",
  compressHTML: false,
  integrations: [sitemap()],
  build: { inlineStylesheets: "never" },
  vite: { build: { assetsInlineLimit: 0, target: "es2020" } },
});
