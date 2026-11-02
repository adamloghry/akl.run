{
  description = "akl.run project hub";

  nixConfig = {
    extra-substituters = [ "https://devenv.cachix.org" ];
    extra-trusted-public-keys = [ "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv = {
      url = "github:cachix/devenv";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, devenv, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      imports = [
        inputs.treefmt-nix.flakeModule
        ./nix/checks.nix
        ./nix/treefmt.nix
        ./nix/golden.nix
      ];

      perSystem =
        {
          pkgs,
          self',
          lib,
          config,
          ...
        }:
        let
          treefmtWrapper = config.treefmt.build.wrapper;
        in
        {
          packages.default = pkgs.buildNpmPackage {
            pname = "akl-run";
            version = "0.1.0";

            src = ./.;

            # importNpmLock avoids needing a precomputed npmDepsHash: it
            # derives the fixed-output derivation(s) directly from
            # package-lock.json instead. See the nixpkgs manual, "Node.js"
            # section, for the canonical example this is based on.
            npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;

            nodejs = pkgs.nodejs_24;

            env = {
              ASTRO_TELEMETRY_DISABLED = "1";
            };

            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          };

          # Image tooling. Deliberately exposed as `apps`, NOT wired into
          # `packages.default` or `checks`: nothing here is realized during a
          # deploy build, so the OG pipeline's closure (chromium especially)
          # never lands in CI or in the deployed Worker's assets. Run on demand.
          apps =
            let
              optimize-og = pkgs.writeShellApplication {
                name = "optimize-og";
                runtimeInputs = [
                  pkgs.pngquant
                  pkgs.oxipng
                ];
                text = ''
                  target="''${1:-public/images/og.png}"
                  [ -f "$target" ] || { echo "error: $target not found" >&2; exit 1; }

                  before=$(stat -c%s "$target" 2>/dev/null || stat -f%z "$target")
                  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

                  # The map is flat-shaded pixel art over a small palette, so a 256
                  # colour quantise is visually lossless here; oxipng then squeezes
                  # the deflate stream. Order matters — quantise first, then re-pack.
                  pngquant --quality 70-95 --speed 1 --force \
                    --output "$tmp/out.png" "$target"
                  oxipng -o 4 --strip safe --quiet "$tmp/out.png"
                  cp "$tmp/out.png" "$target"

                  after=$(stat -c%s "$target" 2>/dev/null || stat -f%z "$target")
                  echo "$target: $before -> $after bytes ($(( 100 - after * 100 / before ))% smaller)"
                '';
              };

              capture-og = pkgs.writeShellApplication {
                name = "capture-og";
                runtimeInputs = [
                  pkgs.chromium
                  pkgs.python3
                  pkgs.pngquant
                  pkgs.oxipng
                ];
                text = ''
                  seed="''${1:-0xa85b492a}"
                  dist="''${2:-dist}"
                  out="''${3:-public/images/og.png}"

                  if [ ! -f "$dist/index.html" ]; then
                    echo "error: $dist/index.html not found — run 'npm run build' or" >&2
                    echo "       'nix build' (then pass ./result) before capturing." >&2
                    exit 1
                  fi

                  work=$(mktemp -d)
                  cleanup() {
                    if [ -n "''${srv:-}" ]; then kill "$srv" 2>/dev/null || true; fi
                    rm -rf "$work"
                  }
                  trap cleanup EXIT
                  cp -rL "$dist" "$work/site"
                  chmod -R u+w "$work/site"

                  # Pin everything non-deterministic the renderer reads so the capture
                  # is byte reproducible: rAF timestamp and performance.now() drive
                  # the belt phase, radar rotation, smoke and bot motion; Date drives
                  # the America/Los_Angeles day/night tint (fixed instant is 12:00
                  # PDT, i.e. full daylight); Math.random (a seeded LCG) drives the
                  # ephemeral animation state - World ctor, Cam.pick, bots, train
                  # spawn, launch timing - whose call order is stable under pinned
                  # clocks (the seasonal rain is a pure function of Date, so the
                  # Date pin fixes it too). A pin stylesheet freezes CSS animation
                  # (the rise-in) and transitions. Everything is injected into the
                  # throwaway copy served here, never into the shipped page (inline
                  # script/style would break the CSP). The script goes in at the very
                  # start of <head> so it runs before boot.js and the engine module.
                  python3 - "$work/site/index.html" <<'PY'
                  import sys
                  path = sys.argv[1]
                  pin = """<script>
                  (function () {
                    var FIXED = 1786302000000, T = 1000;
                    performance.now = function () { return T; };
                    var raf = window.requestAnimationFrame.bind(window);
                    window.requestAnimationFrame = function (cb) { return raf(function () { cb(T); }); };
                    var RealDate = Date;
                    window.Date = class extends RealDate {
                      constructor() { if (arguments.length) { super(...arguments); } else { super(FIXED); } }
                      static now() { return FIXED; }
                    };
                    var lcg = 0x2545f491;
                    Math.random = function () { lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0; return lcg / 4294967296; };
                    var st = document.createElement('style');
                    st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
                    document.head.appendChild(st);
                  })();
                  </script>
                  """
                  html = open(path).read()
                  assert '<head>' in html, 'no <head> in index.html'
                  open(path, 'w').write(html.replace('<head>', '<head>' + pin, 1))
                  PY

                  port=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
                  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$work/site" >/dev/null 2>&1 &
                  srv=$!
                  sleep 1

                  # The log timestamps and night tint read local time: pin the zone too.
                  export TZ=America/Los_Angeles

                  echo "capturing seed=$seed at 1200x630 ..."
                  # Headless Chromium reports (hover: none). Force desktop hover/pointer
                  # types so the capture matches what a desktop visitor sees.
                  chromium --headless --no-sandbox --disable-gpu --hide-scrollbars \
                    --force-prefers-reduced-motion \
                    --force-device-scale-factor=1 --window-size=1200,630 \
                    --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 \
                    --virtual-time-budget=8000 --screenshot="$work/shot.png" \
                    "http://127.0.0.1:$port/?seed=$seed" 2>/dev/null

                  python3 - "$work/shot.png" <<'PY'
                  import struct, sys
                  d = open(sys.argv[1], 'rb').read(33)
                  w, h = struct.unpack('>II', d[16:24])
                  assert (w, h) == (1200, 630), 'expected 1200x630, got %dx%d' % (w, h)
                  print('captured %dx%d' % (w, h))
                  PY

                  pngquant --quality 70-95 --speed 1 --force --output "$work/opt.png" "$work/shot.png"
                  oxipng -o 4 --strip safe --quiet "$work/opt.png"
                  mkdir -p "$(dirname "$out")"
                  cp "$work/opt.png" "$out"
                  echo "wrote $out ($(stat -c%s "$out") bytes, seed $seed)"
                '';
              };
              # Deploy the assets-only Worker straight from a workstation,
              # bypassing Workers Builds: nix build -> dereference -> upload.
              deploy = pkgs.writeShellApplication {
                name = "deploy";
                runtimeInputs = [
                  pkgs.wrangler
                  pkgs.git
                  pkgs.coreutils
                  pkgs.gnused
                ];
                text = ''
                  export WRANGLER_SEND_METRICS=false

                  src="''${1:-}"
                  if [ -z "$src" ]; then
                    if [ -e result ]; then
                      src=result
                    elif [ -d dist ]; then
                      src=dist
                    else
                      echo "error: no build found. Run 'nix build' (preferred — it is" >&2
                      echo "       exactly what CI publishes) or 'npm run build'." >&2
                      exit 1
                    fi
                  fi
                  [ -f "$src/index.html" ] || { echo "error: $src/index.html not found" >&2; exit 1; }

                  [ -f wrangler.jsonc ] || { echo "error: run from the repo root (wrangler.jsonc not found)" >&2; exit 1; }

                  : "''${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (a token with the Workers Scripts:Edit permission)}"
                  : "''${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"

                  # result/ is a symlink into the read-only nix store; wrangler wants
                  # a real, writable tree. -L dereferences it. wrangler.jsonc names
                  # ./dist, so lay the copy out next to it under that name.
                  work=$(mktemp -d)
                  trap 'rm -rf "$work"' EXIT
                  cp -rL "$src" "$work/dist"
                  chmod -R u+w "$work/dist"
                  cp wrangler.jsonc "$work/"

                  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)
                  commit=$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)
                  dirty=false
                  if ! git diff --quiet HEAD 2>/dev/null; then dirty=true; fi
                  message="$branch@$commit dirty=$dirty"

                  cd "$work"
                  if [ "$branch" = trunk ]; then
                    echo "deploying $src -> Worker akl-run, production ($message)"
                    wrangler deploy --message "$message"
                  else
                    # Preview aliases are DNS labels: lowercase, [a-z0-9-].
                    alias=$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' \
                      | sed 's/--*/-/g; s/^-//' | cut -c1-40 | sed 's/-$//')
                    echo "uploading $src -> Worker akl-run, preview '$alias' ($message)"
                    wrangler versions upload --preview-alias "$alias" --message "$message"
                  fi
                '';
              };
            in
            {
              optimize-og = {
                type = "app";
                program = "${optimize-og}/bin/optimize-og";
              };
              deploy = {
                type = "app";
                program = "${deploy}/bin/deploy";
              };
            }
            # chromium is Linux-only in nixpkgs; keep darwin eval clean.
            // lib.optionalAttrs pkgs.stdenv.isLinux {
              capture-og = {
                type = "app";
                program = "${capture-og}/bin/capture-og";
              };
            };

          devShells.default = devenv.lib.mkShell {
            inherit inputs pkgs;
            modules = [
              (
                { pkgs, ... }:
                {
                  languages.javascript = {
                    enable = true;
                    package = pkgs.nodejs_24;
                    npm.enable = true;
                    npm.install.enable = true;
                  };

                  # devenv vendors git-hooks.nix, so this needs no extra
                  # flake input. treefmt is the single formatting
                  # authority -- it already knows which files ship
                  # verbatim and must not be touched.
                  git-hooks.hooks = {
                    treefmt = {
                      enable = true;
                      package = treefmtWrapper;
                    };
                  };

                  scripts.dev.exec = "npm run dev";
                  scripts.build.exec = "npm run build";
                  scripts.preview.exec = "npm run preview";

                  processes.astro.exec = "npm run dev";

                  enterShell = ''
                    echo "akl.run dev environment"
                    echo "  dev     - start the Astro dev server (npm run dev)"
                    echo "  build   - build the site to dist/ (npm run build)"
                    echo "  preview - preview the production build (npm run preview)"
                    echo "  devenv up - run the dev server as a managed process"
                  '';
                }
              )
            ];
          };

          checks.build = self'.packages.default;

          checks.astro-check = pkgs.buildNpmPackage {
            pname = "akl-run-check";
            version = "0.1.0";
            src = ./.;
            npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;
            # nodejs_24 here matches packages.default.
            nodejs = pkgs.nodejs_24;
            env.ASTRO_TELEMETRY_DISABLED = "1";
            buildPhase = ''
              runHook preBuild
              npm run check
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              touch $out
              runHook postInstall
            '';
          };
        };
    };
}
