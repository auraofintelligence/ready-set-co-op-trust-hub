# Automatic deployment of the existing Cloudflare service

Prepared 27 November 2026. Repository preparation does not establish that the Cloudflare connection is enabled or that a production deployment has succeeded.

## One-time dashboard settings

Open **Workers & Pages → ready-setco → Settings → Builds**. Edit the existing connection, or choose **Connect** if no repository is connected.

| Setting | Value |
| --- | --- |
| GitHub account | `auraofintelligence` |
| Repository | `ready-set-co-op-trust-hub` |
| Production branch | `main` |
| Root directory | Repository root, `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy` |
| Preview builds | Disabled |
| API token | The dedicated `ready-set-co-op-trust-hub` user token for this account |

The repository's `.nvmrc` selects Node.js 24, and `packageManager` selects the validated npm version. Keep the default dependency installation enabled, including development dependencies. Do not set a production-only dependency omission: checks and deployment require jsdom and the pinned Wrangler version. The public output directory is already `./dist` in `wrangler.jsonc`.

## GitHub repository access

In the installed **Cloudflare Workers & Pages** GitHub app, **Only select repositories** is supported. Include `ready-set-co-op-trust-hub` in the selected repositories, keep the other projects' selections, and save. Return to this Worker's Builds settings and refresh to confirm that the disconnected Git account warning has cleared. Installing the app for repository access and authorising it for your own GitHub user are separate steps.

## Dedicated build token

Use the dedicated `ready-set-co-op-trust-hub` token for this Worker. Keep the wildlife-rescue project's token and connection intact. Worker deployment and D1 migration permissions are both required by the deploy command.

Inspect an actual build failure before changing token permissions. If a build reports missing D1 write access, open [User API tokens](https://dash.cloudflare.com/profile/api-tokens), edit this token's existing **Account policy** for the Cloudflare account, and enable the D1 write permission. Preserve the Worker deployment permissions. Empty additional policies do not grant access. Save the token changes and retry the failed build; if Cloudflare reports a stale token, select a valid token in Builds settings. Never place a token value in source, public variables or chat.

Keep the existing Worker Access configuration and runtime secrets. Build variables and runtime secrets are different settings. The deploy command uses `--keep-vars` to retain dashboard-configured variables; committed variables are still applied by Wrangler.

## What runs after a push to main

1. Cloudflare installs the locked dependencies.
2. The build command checks syntax, page links, private-file exclusions and routing; runs the tests; and builds the public assets.
3. The deploy command verifies the existing Worker, account, database and production branch, then applies unrecorded D1 migrations.
4. Only after the migrations succeed does Wrangler deploy the Worker and assets to the existing service.

Wrangler records applied migrations in `d1_migrations` and does not reapply recorded files. If the earlier dashboard paste created only some of migration 0004's objects without recording it, its `IF NOT EXISTS` statements allow Wrangler to finish it. A recorded migration is not a schema-validation result: confirm the four tables, three named indexes, eight triggers and migration record before calling the new private workspace operational.

Keep migrations compatible with the currently running Worker. A failed check or migration stops deployment. If a migration succeeds and the later upload fails, the schema change remains; retrying does not undo it. The current 0004 migration is additive. Use one production deployment path and avoid overlapping production releases; this setup does not add a distributed migration lock.

## Confirm the first deployment

Save the connection, then open the Worker's **Deployments → View build history**. Use the available retry/build action or push a new commit to `main` to start the first build. Check that the successful build is for the intended commit and produces an active deployment of `ready-setco`.

Verify the formation pages on the existing workers.dev hostname, signed-out private-route protection and authorised organiser access. A successful source commit or a Console message saying no data was returned does not prove those checks.

## Sources

- [Connect an existing Worker](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [GitHub app installation, authorisation and selected repository access](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Build troubleshooting](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/)
- [Build commands, environment variables and API token permissions](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Node and package manager versions](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [D1 migration tracking](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 migration commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Build limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
