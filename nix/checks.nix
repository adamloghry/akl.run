{
  perSystem =
    { pkgs, self', ... }:
    {
      # Unit tests (vitest) against the locked deps; no network needed.
      checks.unit = pkgs.buildNpmPackage {
        pname = "akl-run-unit";
        version = "0.1.0";
        src = ./..;
        npmDeps = pkgs.importNpmLock { npmRoot = ./..; };
        npmConfigHook = pkgs.importNpmLock.npmConfigHook;
        nodejs = pkgs.nodejs_24;
        env.CI = "1";
        buildPhase = ''
          runHook preBuild
          npm test
          runHook postBuild
        '';
        installPhase = ''
          runHook preInstall
          touch $out
          runHook postInstall
        '';
      };

      # The CSP forbids inline script/style and the browser blocks them
      # silently; turn that into a build failure.
      checks.csp-output = pkgs.runCommand "csp-output" { } ''
        set -euo pipefail
        site=${self'.packages.default}
        status=0
        for f in $(find "$site" -name '*.html'); do
          if grep -q '<style' "$f"; then echo "csp-output: <style> in $f" >&2; status=1; fi
          if grep -q ' style=' "$f"; then echo "csp-output: style= in $f" >&2; status=1; fi
          if grep -oE '<script[^>]*>' "$f" | grep -v ' src=' | grep -vq 'application/ld+json'; then
            echo "csp-output: inline <script> in $f" >&2; status=1
          fi
        done
        grep -q 'boot.js?v=' "$site/index.html" || { echo "csp-output: boot.js missing" >&2; status=1; }
        n=$(grep -o '<script type="module" src="/_astro/' "$site/index.html" | wc -l)
        [ "$n" -eq 1 ] || { echo "csp-output: expected 1 module script, got $n" >&2; status=1; }
        [ "$status" -eq 0 ]
        echo ok > $out
      '';
    };
}
