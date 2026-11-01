{
  perSystem =
    { pkgs, self', ... }:
    let
      generated = [
        "index.html"
        "sitemap-index.xml"
        "sitemap-0.xml"
      ];
    in
    {
      # Fails on any byte change to the deployed output. The three
      # generated files are compared verbatim so failures print a real
      # diff; everything else in dist/ -- the public/ passthrough,
      # og.png included -- is covered by hash, which catches added,
      # dropped and altered files without committing binaries twice.
      checks.golden-output = pkgs.runCommand "golden-output" { } ''
        set -euo pipefail
        site=${self'.packages.default}
        golden=${./../golden}
        status=0

        for f in ${builtins.concatStringsSep " " generated}; do
          if ! diff -u "$golden/$f" "$site/$f"; then
            echo "golden-output: $f differs" >&2
            status=1
          fi
        done

        if ! (cd "$site" && find . -type f | sed 's|^\./||' | LC_ALL=C sort \
              | xargs sha256sum) | diff -u "$golden/manifest.sha256" -; then
          echo "golden-output: dist tree differs" >&2
          status=1
        fi

        if [ "$status" -ne 0 ]; then
          echo "" >&2
          echo "The built output no longer matches golden/." >&2
          echo "If this change is intentional, run: nix run .#update-golden" >&2
          echo "and include the regenerated golden/ files in your commit." >&2
          exit 1
        fi

        echo "golden-output: output matches" > $out
      '';

      apps.update-golden = {
        type = "app";
        program = "${
          pkgs.writeShellApplication {
            name = "update-golden";
            runtimeInputs = [ pkgs.coreutils ];
            text = ''
              site="''${1:-}"
              if [ -z "$site" ]; then
                if [ -d dist ]; then
                  site=dist
                elif [ -e result ]; then
                  site=result
                else
                  echo "error: no build found. Run 'npm run build' or 'nix build'." >&2
                  exit 1
                fi
              fi
              [ -f "$site/index.html" ] || { echo "error: $site/index.html not found" >&2; exit 1; }

              mkdir -p golden
              for f in ${builtins.concatStringsSep " " generated}; do
                cp -f "$site/$f" "golden/$f"
              done
              chmod u+w golden/*
              (cd "$site" && find . -type f | sed 's|^\./||' | LC_ALL=C sort \
                | xargs sha256sum) > golden/manifest.sha256

              echo "golden/ updated from $site"
              echo "review the diff before committing: git diff golden/"
            '';
          }
        }/bin/update-golden";
      };
    };
}
