# Acceptance harness (handoff section 9)

Plain Node + playwright-core, outside nix. Serves `dist/` with the `/*` block of `public/_headers` applied to every response, and maps `akl.run` and `factory.akl.run` to it.

    npm run build
    (cd tests/e2e && npm install)
    node tests/e2e/run.mjs [check...]     # default: all except coverage

Checks: shots, csp, layout, a11y, jsoff, reduced, perf, determinism, host, coverage (opt-in, about 6 min).
Exit code is non-zero on any failure. Screenshots go to `tmp/shots/`. Checks that need `window.__mapgen` report `skipped` when it is absent.

Touch emulation (`hasTouch`) is off by default; only the `touch-readout` shot enables it (`open(..., { touch: true })`).
`coverage` runs on `factory.akl.run/?seed=0xa85b492a` and polls every 5 s, so each deadline allows `by + 5` seconds of polling tolerance.

Env: `CHROMIUM` is the path to a chromium binary (default: `nix build nixpkgs#chromium`, cached in `tmp/.chromium-path`); `PORT` (default 4329).
