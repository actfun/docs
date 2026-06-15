---
name: ACTFUN logo (code SVG)
description: The ACTFUN brand logo is recreated in code as SVG, not a raster image — where it lives and what must stay in sync.
---

The ACTFUN logo (glowing blue perfect-circle ring + white up-right "growth" arrow mark)
is recreated entirely in code as SVG, NOT a pasted raster image.

- React component: `artifacts/actfun/src/components/ActfunLogo.tsx` — used for all in-app
  UI logo spots (header/hero/footer, token detail, leaderboard, card pages).
- Standalone file: `artifacts/actfun/public/actfun-logo.svg` — used for the favicon
  (`index.html`) and the Dynamic wallet `appLogoUrl` (`App.tsx`), which both need a real URL.

**Rule:** the two files share the same circle/glow/arrow geometry. If you change the mark,
update BOTH the component paths and `public/actfun-logo.svg` in lockstep, or the favicon /
wallet branding will drift from the in-app logo.

**Why:** user explicitly wanted the logo "built in code," a perfect circle, applied everywhere —
not the old `/actfun-logo.jpg|png` raster files (now unused by the web app).

Legacy raster files (`public/actfun-logo.jpg|png|-transparent.png`) are left in place but no
longer referenced by the web UI; do not reintroduce them as the logo.
