# Ready SETCO operations on Cloudflare

This application accepts expressions of interest and records follow-up for the proposed Ready Sustainable Employment and Training Cooperative. Strange But True is the initial operator. Submitting a form does not create cooperative membership, employment, a partnership, a grant entitlement or visa-qualifying work. Those decisions require their own human process and appropriate legal entity.

## Application layout

- Existing HTML, CSS, JavaScript and `assets/` form the public site.
- `join.html` submits participation interest to the public intake API.
- `manage.html` uses the private administrative API for review and export.
- `cloudflare/worker.mjs` is the shared HTTP entry point.
- `migrations/` contains SQLite-compatible database migrations.
- `scripts/build.mjs` creates an allowlisted `dist/`; server code, private records, dependencies and repository documentation are not public assets. The public licence is retained.
- The Worker uses its dedicated `DB` binding and static `ASSETS` binding. It must run before `/api/*`, `/manage`, `/manage.html` and `/manage/*`, including administrative route aliases.

No private register is stored in GitHub or in the public site. Public interest intake is separate from formal cooperative membership and from employee records.

## Local operation with durable SQLite

Use Node.js 24 or newer. The bundled Codex runtime may provide a newer Node than the first executable on Windows PATH.

```powershell
npm install
npm run check
npm test
npm start
```

The server builds the public site, applies unapplied SQL migrations, and binds only `127.0.0.1:8792`. `READY_SETCO_PORT` can select another local port. Records persist in ignored `.local/ready-setco.sqlite`. `READY_SETCO_DATA_DIR` can explicitly select an isolated test or restored database directory, such as `.local/interface-test-<unique-id>`. Paths inside the checkout must remain under `.local`; a private absolute directory outside the checkout is also supported. The directory comes from the server environment, never an HTTP request. Preserve the database and any SQLite WAL files when making a live backup, or use a consistent SQLite backup/export procedure.

The server prints a new random administrative token at startup. At the local `manage.html`, enter it in the local sign-in field. The UI keeps the token in page memory only and sends `Authorization: Bearer …` for administrative API requests. A page reload requires entering it again. Do not put it in localStorage, URLs, source, exports or committed configuration.

The Worker accepts this path only when the environment explicitly sets `LOCAL_DEV=true` **and** the request URL is loopback. The local server rejects unexpected Host headers and never listens on external interfaces. This is a local development path, not an alternative production sign-in. Production must never set `LOCAL_DEV` or `LOCAL_ADMIN_TOKEN`.

Local SQLite and Cloudflare D1 are separate stores. Starting local operation neither downloads nor changes Cloudflare data. The local adapter implements D1 prepared statements and transactional batches so the same Worker and migrations can run on an island server later.

## Cloudflare deployment

Use the existing authorised account, not a temporary preview account. The configured account ID is `8ec4bbe64bddc4086162119149e37ef8`. `wrangler.jsonc` is dedicated to Worker `ready-setco` and database `ready-setco-operations`; it does not share the P4A register or identity permissions.

The existing database ID is `da54bed9-19e4-4559-91a0-605661217183`, already recorded in `wrangler.jsonc`. Keep this service and database. For automatic deployment from GitHub, follow [Automatic deployment](AUTOMATIC-DEPLOYMENT.md), using a dedicated Ready SET Co-op build token with Worker deployment and D1 Edit permissions. The production commands are `npm run build:cloudflare` and `npm run deploy`.

For an explicitly authorised manual release from an authenticated checkout, first confirm the active account with `npx wrangler whoami`. The following commands prepare and inspect the existing service:

```powershell
npx wrangler d1 migrations apply ready-setco-operations --remote
npm run build
npx wrangler deploy --dry-run
```

Before publishing real intake, set the public origin allowlist to the exact HTTPS origins that serve the form. The Worker's own origin is permitted automatically; include the GitHub Pages origin separately if it continues serving the form. `ALLOWED_ORIGINS` is a comma-separated list of origins, not page URLs. It applies to public intake; administrative writes require the same origin.

## Administrative access

Native Webmaster and committee access is now available through `portal.html`. The shortest setup uses one private runtime secret and the one-time owner password setup in [MEMBER-SERVICES.md](MEMBER-SERVICES.md#activate-the-existing-service). The Access instructions below are retained as an optional legacy operator route. Do not put the public portal or its registration endpoints behind an administrator-only Access policy.


Retain the existing Ready SETCO Cloudflare Access application. If initial Access configuration has not yet been completed, configure an application for the deployed hostname and these private paths:

- `/manage.html`
- `/manage`
- `/manage/*`
- `/api/admin/*`

Use explicit invited administrator identities and an authenticated sign-in method. An Access application can include multiple exact/path destinations. Do not put the public `join.html`, `/api/intake` or `/api/health` behind the administrator-only policy. Do not reuse P4A's application audience or political membership permissions. Review both the workers.dev hostname and any future custom hostname so a second route cannot bypass protection.

The Worker independently verifies the Access JWT signature, application audience, issuer, time claims and administrator allowlist. Merely receiving an Access-looking header does not authorise access. Missing identity configuration fails closed.

Set these server-side secrets through Wrangler's prompted input; never put their values in committed source or frontend configuration:

```powershell
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ADMIN_EMAILS
npx wrangler secret put RATE_LIMIT_SALT
```

- `ACCESS_TEAM_DOMAIN`: the exact Zero Trust team domain, ending in `.cloudflareaccess.com`.
- `ACCESS_AUD`: the audience identifier from the new Ready SETCO Access application.
- `ADMIN_EMAILS`: comma-separated administrator addresses approved for this service.
- `RATE_LIMIT_SALT`: a fresh cryptographically random secret, used for the intake abuse-control identifiers.

Configure `ALLOWED_ORIGINS` as a Worker variable or secret. `INTAKE_RATE_LIMIT` optionally overrides the default of ten intake attempts per hour. There is no need to expose either in frontend source. `operations-config.js` contains only the public API base URL.

The administrative API is:

- `GET /api/admin/participants`
- `PATCH /api/admin/participants/:id`
- `GET /api/admin/export`

Configure and verify Access before opening administrative access. The Worker also protects the administrative page. The public health endpoint must not expose records, credentials or private configuration.

After configuration and checks:

```powershell
npx wrangler deploy
```

Keep the exact returned deployment URL. Verify public intake with an approved test entry, confirm persistence after a new session, and check that signed-out requests to both private routes disclose no records. Review with an authenticated authorised identity, exercise a status change, and download a restricted export. A passing local test does not establish a live deployment or a working Access policy.

## Records and handover

An expression of interest is not an admission or a commercial agreement. Record the policy version, submission date, permitted contact use, review history and responsible reviewer. Collect only the details needed for follow-up. Passport scans, tax file numbers, bank details and health information do not belong in this intake.

Keep the original legal operator and dates on records. A later Ready SETCO handover needs the new entity's authority, registrations and agreed arrangements for each contract, employment relationship, grant and personal-data use. A software status change cannot transfer those obligations. Worker payroll and statutory records should be handled in suitable dedicated private systems.

## Running on island servers later

The application uses standard HTTP requests, responses, SQL migrations and stable record IDs. D1 is the initial storage adapter, rather than a requirement in the application model. The local server already runs the same Worker against a persistent SQLite database.

For server deployment:

1. Provision organisation-controlled hardware, supported Node, storage, backup power and a managed HTTPS endpoint.
2. Export D1 consistently with `wrangler d1 export ready-setco-operations --remote --output <private-path.sql>` and retain a protected administrative JSON export for verification. Keep backups outside the public source checkout.
3. Restore the SQL into SQLite, or migrate through a tested PostgreSQL adapter. Reconcile counts, stable IDs, timestamps, policy versions and review history before cutover.
4. Replace the loopback development adapter with production server operation and a selected identity service. Cloudflare Access can remain in front of a protected origin initially; locally hosted OpenID Connect can be introduced through a separately tested identity adapter.
5. Rehearse restore, access revocation, export and rollback. Pause writes during final cutover, reconcile the final export, and switch the public API address once one authoritative store is established.

`npm start` intentionally remains loopback-only. Do not make it externally reachable by changing the bind address or enabling its local token on a public host. A production island-server adapter needs HTTPS, production identity verification and its own acceptance checks.

## Repeatable portability rehearsal

```powershell
node scripts/verify-portability.mjs
```

This explicit integration check requires Node.js 24 and local loopback networking for Cloudflare's local runtime. It creates a uniquely named ignored directory under `.local`, applies all migrations to an isolated local D1 store, records a fictional intake and review, and uses Wrangler's SQL export. It restores that export into native SQLite using the same adapter as the local server, compares the complete register and audit history, verifies that immutable history triggers still reject changes, and calls the shared Worker's administrative export API against the restored database. It does not open a browser, authenticate to Cloudflare, provision resources or read a real register.

The 19 November 2026 rehearsal passed with migrations `0001_intake.sql` and `0002_operator_legal_name.sql`. This verifies local D1-to-SQLite portability; a future live-account export and production cutover still need their own checks. Wrangler's local export has no `--persist-to` option, so the rehearsal uses an isolated local configuration to keep its default state directory separate from ordinary local work.


## Formation and governance extension, 27 November 2026

The existing `manage.html` now includes private formation and governance workspaces. Apply `migrations/0004_governance.sql` to `ready-setco-operations` before deploying the extended Worker. It adds empty governance tables only; the participant and map tables retain their existing scope. Do not create another Worker, database or hosting project for this extension.

Routes under `/api/admin/governance/*` now accept native Webmaster sessions and scoped local committee assignments as well as the existing Access audience/allowlist. A committee can see only its linked workspaces; Webmasters and configured legacy organisers remain global operators. See [GOVERNANCE-API.md](GOVERNANCE-API.md) for schemas and [MEMBER-SERVICES.md](MEMBER-SERVICES.md) for account activation, local roles, applications, notices and private export.

The existing participant export and map export do not include governance records. Each formation workspace has its own complete JSON export. A full D1/SQLite database backup includes all four governance tables and their revision histories. Retain access restrictions on every export.

The public `formation-planner.html` uses optional browser-local storage and downloads only. It sends no draft to the server and does not change the cooperative's records. The other new public pages are `formation.html`, `cooperative-law.html`, `governance.html` and `cooperative-network.html`.

Source implementation and local tests do not establish production deployment. Verify the final Cloudflare version, the applied migration and authorised/signed-out access before describing the private workspace as live.


## Member account extension, 27 November 2026

Automatic deployment applies account migrations `0005_member_accounts.sql`, `0006_member_services.sql` and `0007_member_passwords.sql` to this same database. The portal defaults to username/password authentication through OPAQUE, with optional WebAuthn passkeys, opaque HttpOnly sessions, single-use recovery codes and audited local-group permissions. It needs `READY_AUTH_SECRET` as a Worker runtime secret; it does not need a new database, email provider, build token or Cloudflare Access configuration. The first Webmaster must complete the owner setup personally and save the recovery codes.

The local server accepts `READY_AUTH_SECRET` from the process environment for isolated development. Keep it outside source. Existing local organiser-token tests remain supported. Preserve the encrypted password-protocol setup with the existing runtime secret when moving hosts. A future domain change also needs relying-party continuity or verified re-enrolment for people who opted into passkeys. Do not rotate `READY_AUTH_SECRET` after passwords are enrolled without rewrapping the stored OPAQUE setup. See [authentication operations](MEMBER-AUTH.md).
