# akl.run

https://akl.run — projects, running on top of a small factory.

Astro static site, nix flake dev env, deployed to Cloudflare Workers as static assets.

    nix develop --impure
    npm run dev
    npm run build
    npm test
    npm run test:bombadil  # after build; explores browser states for 30 seconds

See [AGENTS.md](AGENTS.md).
