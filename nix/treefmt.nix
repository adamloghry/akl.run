{
  perSystem = _: {
    treefmt = {
      projectRootFile = "flake.nix";

      programs.nixfmt.enable = true;
      programs.prettier.enable = true;

      # These files ship byte-for-byte and must not be reformatted.
      #
      # - index.astro: the site builds with `compressHTML: false`, so
      #   source whitespace flows straight into dist/index.html.
      #   Reformatting it changes the deployed bytes and fails the
      #   golden-output check.
      # - public/assets/**: served verbatim at stable URLs (boot.js, fonts).
      # - public/_headers: served verbatim; its column alignment is
      #   meaningful to read.
      # - golden/**: a snapshot of build output. Formatting it would
      #   make it stop matching what the build produces.
      # - astro.config.mjs: prettier reformats its `compressHTML: false`
      #   and other options in ways that are cosmetic today but easy to
      #   mis-review against the build-output guarantees this file
      #   controls; kept hand-formatted so a diff here is always a real
      #   config change, not noise.
      # - docs/**: design handoff and plans, kept verbatim as delivered.
      settings.global.excludes = [
        "docs/**"
        "src/pages/index.astro"
        "astro.config.mjs"
        "public/assets/**"
        "public/_headers"
        "golden/**"
        "**/package-lock.json"
        "*.woff2"
        "*.png"
        "*.ico"
        "*.svg"

        # Markdown is excluded deliberately. This repo's docs are dense
        # with HTML and shell examples whose exact characters are the
        # point -- prettier rewrites HTML inside fenced code blocks, and
        # it has already been observed turning `<meta charset="utf-8">`
        # into `<meta charset="utf-8" />` inside the migration plan,
        # inverting the very instruction that block exists to give.
        # Formatter scope here is nix, json, workflows and src JS/TS.
        "*.md"
      ];
    };
  };
}
