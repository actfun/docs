---
name: Mintlify docs deployment
description: How to deploy actfun/docs to actfudocs.mintlify.app after pushing GitHub changes
---

## The problem
Pushing commits to `actfun/docs` (GitHub) does NOT automatically rebuild the Mintlify site at `actfudocs.mintlify.app`. The Mintlify GitHub App is either not installed or not configured for auto-deploy on this repo.

## What DOES work
1. Push all MDX/docs.json changes to GitHub via the GitHub Contents API (using `AMATHXBT_GITHUB_KEY`).
2. Go to **https://app.mintlify.com** → find the MINEPAD project → click **Deploy** (or Redeploy).
3. The site rebuilds in ~2 minutes.

## What does NOT work
- `npx mintlify@latest deploy` — crashes on Node v24 with `ERR_UNSUPPORTED_DIR_IMPORT` in `es-toolkit/compat`.
- REST API at `https://api.mintlify.com/v1/*` — returns 404 for all deploy endpoints.
- REST API at `https://leaves.mintlify.com/api/cli/deploy/actfudocs` — returns 401 `session_invalid` because it needs a Stytch OAuth session token from `mint login`, NOT the `mint_` project API key.
- The `mint_` key (e.g. `mint_51v...`) is a project-level API key, NOT a user session token.

**Why:** The Mintlify CLI uses Stytch OAuth (browser-based) for auth. The session token lives in the OS keyring (`~/.config/mintlify/config.json`). There is no headless API for triggering site rebuilds — it requires either the dashboard UI or a connected GitHub App webhook.
