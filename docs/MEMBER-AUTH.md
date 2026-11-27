# Private accounts and passkeys

This module adds real participant accounts to the existing ready SET Co-op Worker and D1 database. A person creates a passkey, signs in, maintains their private participation information and applies to a local group. Creating an account does not admit someone to a cooperative, establish employment, transfer an earlier expression of interest or accept a future operator.

The public formation and governance hub remains open. The account portal is `portal.html`. Group applications, scoped committee access and membership evidence are handled separately by `cloudflare/member-services.mjs`. Account security is implemented in `cloudflare/accounts.mjs`.

## Existing service and initial setup

Use the existing Cloudflare Worker **ready-setco** and its **ready-setco-operations** D1 database. Do not create another Worker, database, authentication service or hosting project.

1. Apply the repository migrations through the existing automatic deployment workflow. `0005_member_accounts.sql` adds the account schema; `0006_member_services.sql` adds participation services. Neither migration seeds a person, a passkey, a cooperative or a role.
2. Open **https://ready-setco.auraofintelligence.workers.dev/portal.html#setup**. Choose **Generate setup key**, then **Copy setup key**. This generates 32 random bytes in that browser and retains the value in the setup form. Keep the page open.
3. In Cloudflare, open **Workers & Pages → ready-setco → Settings → Variables and Secrets → Add**. Choose **Secret**, name it **READY_AUTH_SECRET**, paste the copied value, then choose **Deploy**. Keep a private copy in a password manager. Do not paste it into a GitHub file, issue, message or public URL.
4. Return to the portal and choose **Check setup**. Supply a username, display name and contact email, accept the account privacy information, and create a passkey when the browser asks. The setup form retains the generated key for this step.
5. Save the eight recovery codes somewhere private and separate from the device. They are displayed once. Add a second passkey if a second suitable device or security key is available.
6. Verify that the portal identifies the new account as webmaster and that sign-out followed by passkey sign-in works. The webmaster can then establish local groups and explicitly assign scoped committee roles.

The first public registrant does **not** become webmaster. Bootstrap requires the configured secret and a verified passkey. Its permanent singleton record is created atomically with the webmaster account. After that, the setup key cannot establish a second initial webmaster, even if the secret is changed. Keep the secret configured: it remains the server key for private links, recovery codes, browser challenge bindings and rate-limit identifiers.

The accepted secret syntax is 43 to 128 URL-safe characters. The browser generates 64 hexadecimal characters from cryptographically random bytes. There is no fallback to `RATE_LIMIT_SALT` or to a hard-coded key.

The session endpoint reports configuration and migration readiness without revealing the secret. Until setup is completed, the portal must describe the real state. Existing public pages and expressions of interest remain separate.

## What people use

People use a passkey supported by their browser, device or security key. User verification is required, such as the device's PIN or biometric check. The site stores the public credential, never the private key, device PIN or biometric information. There are no account passwords to store or reset and no automatic email service.

Use a stable public hostname. A passkey is bound to the hostname on which it was created. A later move to a different hostname needs a planned sign-in and passkey enrolment transition; copying the database alone does not make a passkey work on an unrelated domain.

Contact email is explicitly **unverified**. It is a contact field and must not be treated as verified identity, proof of group membership or an automatic account recovery destination.

An ordinary account has no global organiser access. A webmaster has global administration privileges. Committee permissions are scoped to groups in the member service, and formal cooperative admission requires its own recorded evidence. Verified legacy Cloudflare Access or explicitly configured loopback development authentication can remain webmaster fallbacks through the Worker; client headers containing an email or role do not grant access.

## Sessions and verification

The server uses `@simplewebauthn/server` to generate WebAuthn options and verify registration and authentication responses. It checks the exact request origin and hostname, challenge, user presence, user verification, credential public key and applicable authenticator counter. Registration supports ES256 and RS256 credentials. The browser uses the locally bundled `@simplewebauthn/browser`.

Each ceremony has a five-minute lifetime, purpose, random challenge, exact origin, relying-party hostname and browser binding. A separate HttpOnly cookie binds the request to the initiating browser. No setup key, raw private link or recovery code is stored in a pending ceremony.

After cryptographic verification, an atomic D1 batch claims the ceremony. Only that batch's winning operation can change the account, store or update the credential, issue recovery codes, create a session and append the audit event. A replay cannot repeat those changes. Persistence failure rolls the complete batch back. Recovery claims also check the account version before consuming a one-use link or code.

Sessions last eight hours. The cookie is:

~~~text
__Host-ready_session=<opaque random token>; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=28800
~~~

D1 stores only the SHA-256 digest of the 256-bit random session token. Every native session lookup checks the account is active, the session has not expired and its authentication version still matches the account. The resolver makes no database query when no native session cookie is present. Permission changes, recovery and explicit revocation invalidate old sessions immediately through that version.

The five-minute ceremony cookie is `__Host-ready_ceremony`. Consumed ceremonies remain unusable even if the browser still has that cookie. One `Set-Cookie` header is emitted per response.

HTTP is permitted only for explicit `LOCAL_DEV=true` on loopback. Local development uses `ready_session_local` and `ready_ceremony_local`; production always requires HTTPS and the secure cookie names.

All account mutations require an exact same-origin `Origin`, JSON content type and a body no larger than 12 KiB. Cross-site mutations are rejected. Responses use `Cache-Control: no-store, private`. D1-backed request limits use keyed hashes of time bucket, operation, Cloudflare-provided client IP and, where supplied, username. IP addresses and attempted usernames are not stored in the limit table. Authenticator verification attempts have their own bound.

Adding or removing passkeys and native webmaster account changes require a passkey session created within the preceding five minutes. The portal prompts for another passkey sign-in when that check fails. Replacing recovery codes has its own passkey authentication ceremony.

## Recovery and account management

Eight recovery codes are generated at enrolment, activation and successful recovery. Each code contains 160 random bits, is stored only as a domain-separated keyed digest and can be used once. Replacing the codes invalidates the previous set.

Recovery uses either a recovery code and username or a private recovery link explicitly prepared by a webmaster. The person must create and verify a new passkey before recovery completes. Completion revokes the old passkeys, sessions, unused links and recovery codes, then issues a new session and eight new codes. A disabled account cannot recover itself back to active status.

A webmaster can reserve an invited account and then prepare an activation link. Links are returned once and are not sent automatically. Activation links last 24 hours; recovery links last one hour. A new link revokes previous unused links for that account. The operator must verify the intended recipient through their established private process before manually sharing a link. Email alone is not verified by this software.

The portal places private invitation and recovery tokens in a URL fragment, reads that fragment locally and removes it from the address bar. Tokens are submitted in JSON only when the person chooses to continue. They must not be copied into public posts or support tickets.

Invited accounts activate through their own passkey ceremony and explicit account consent. Existing active accounts may be disabled and later re-enabled. Keep at least one active webmaster: the server enforces that condition inside the update batch, including concurrent changes. Accounts can have up to 20 active passkeys. Passkeys are revoked rather than deleted, and removing the last active passkey is refused.

If every webmaster loses all passkeys and recovery codes and no verified legacy operator access remains, there is no public back door. Recovery then needs deliberate database-owner maintenance and a recorded operator decision. The permanent bootstrap record must not be removed to bypass this.

Changing the server secret invalidates outstanding keyed links, recovery codes and pending browser-bound ceremonies. It does not by itself invalidate already-issued session digests. Before a planned key rotation, use the account session revocation controls and arrange new recovery codes for affected people. Do not rotate the key as a routine redeployment step.

## API contract

Successful identity objects contain:

~~~json
{
  "accountId": "server-or-invitation-UUID",
  "username": "chosen.username",
  "displayName": "Chosen name",
  "email": "contact@example.test",
  "emailVerified": false,
  "webmaster": false,
  "status": "active",
  "version": 1,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "lastLoginAt": "ISO timestamp or null",
  "authentication": "passkey"
}
~~~

Examples are schema illustrations only. No example identity is installed.

Usernames are lower-case ASCII, 3 to 40 characters, beginning with a letter or number and continuing with letters, numbers, full stops, underscores or hyphens. Display names allow 1 to 120 characters. Contact email is bounded to 254 characters.

Every options response is `{ceremonyId, options}`. Every verification body is `{ceremonyId, response}`, where `response` is the browser library's WebAuthn result. Authentication ceremonies use `startAuthentication`; registration ceremonies use `startRegistration`.

| Endpoint | Options body or action | Result |
| --- | --- | --- |
| `GET /api/auth/session` | Current native or trusted legacy identity | `authenticated`, `identity`, `configured`, `authConfigured`, `bootstrapAvailable`, `setupComplete`, `schemaReady` |
| `POST /api/auth/register/options` | `username`, `displayName`, `email`, `consentAccount:true`, `consentVersion:"2026-11-27"` | Registration ceremony |
| `POST /api/auth/bootstrap/options` | Registration fields plus `bootstrapKey` | Initial webmaster registration ceremony |
| `POST /api/auth/activate/options` | `token` and explicit consent fields | Invited-account registration ceremony |
| `POST /api/auth/recover/options` | Either `token` or `username` and `recoveryCode` | Replacement passkey registration ceremony |
| `POST /api/auth/login/options` | Optional `username` | Passkey authentication ceremony |
| `POST /api/auth/{register,bootstrap,activate,recover}/verify` | Browser registration result | `identity`, eight `recoveryCodes`, session cookie |
| `POST /api/auth/login/verify` | Browser authentication result | `identity`, session cookie |
| `POST /api/auth/logout` | `{}` | Current session revoked, cookie cleared |
| `GET /api/auth/passkeys` | Signed-in personal account | `passkeys`, `recoveryCodesRemaining` |
| `POST /api/auth/passkeys/options` | Optional `name` up to 80 characters | Additional passkey registration ceremony |
| `POST /api/auth/passkeys/verify` | Browser registration result | Updated `identity` |
| `DELETE /api/auth/passkeys/:id` | `{}` | Passkey revoked, all sessions revoked, cookie cleared |
| `POST /api/auth/sessions/revoke` | `{}` | All own sessions revoked, cookie cleared |
| `POST /api/auth/recovery-codes/options` | `{}` | Passkey authentication ceremony |
| `POST /api/auth/recovery-codes/verify` | Browser authentication result | New eight `recoveryCodes`, `identity`, replacement session |

Passkey list entries expose only `id`, `name`, `createdAt`, `lastUsedAt`, `deviceType` and `backedUp`. Neither public keys nor credential IDs are needed by that account screen.

### Webmaster endpoints

All routes below require webmaster authority. Mutations recheck that authority inside the database operation and native sessions must be recent. Pagination uses `page` starting at 1 and `pageSize` from 1 to 100, default 25.

| Endpoint | Body or query | Result |
| --- | --- | --- |
| `GET /api/webmaster/accounts` | Optional `search`, pagination | `accounts`, `total`, `page`, `pageSize` |
| `POST /api/webmaster/accounts` | `id` UUID, `username`, `displayName`, `email` | `{account}` in invited status |
| `PATCH /api/webmaster/accounts/:id` | `expectedVersion`, optional `status` and/or `webmaster` | Updated `{account,ok:true}` |
| `POST /api/webmaster/accounts/:id/invite` | `expectedVersion` | `{account,token,purpose:"activation",expiresAt,sent:false}` |
| `POST /api/webmaster/accounts/:id/recovery-link` | `expectedVersion` | `{account,token,purpose:"recovery",expiresAt,sent:false}` |
| `POST /api/webmaster/accounts/:id/revoke-links` | `expectedVersion` | `{account,ok:true}` |
| `POST /api/webmaster/accounts/:id/revoke-sessions` | `expectedVersion` | `{account,ok:true}` |
| `GET /api/webmaster/accounts/:id/history` | Pagination | `events`, `total`, `page`, `pageSize` |

An identical invitation reservation retry with the same UUID and original values returns the account's **current** version. A conflicting payload with the same UUID is rejected. This lets a client recover if reserving the account succeeded but preparing its private link did not.

Changes require the exact saved version. Permission changes revoke sessions and unused links. An invited account cannot be marked active through a management patch. Only an active account may be granted webmaster access.

Errors use `{error,code}` with ordinary-language messages. Common statuses are 400 invalid fields, 401 sign-in or ceremony failure, 403 insufficient authority or recent sign-in required, 409 stale version or protected last webmaster/passkey, 429 attempt limit, and 503 unavailable configuration or migration. The Worker's final error handler turns unexpected storage failures into a generic unavailable response.

## Storage, audit and portability

Migration `0005_member_accounts.sql` adds nine tables: accounts, the permanent bootstrap singleton, passkeys, sessions, private links, recovery codes, short-lived ceremonies, request-limit buckets and account audit events. It adds indexes and origin/history protection triggers. Existing intake, map and governance records are preserved.

Account origins and usernames are immutable in this API. Account, passkey and audit records have no delete path. Disabled accounts and revoked passkeys retain their history. Account audit events are append-only and use the server-resolved actor, timestamp and action; they never contain setup keys, raw tokens, recovery codes or browser authenticator responses.

Expired sessions, ceremonies and attempt-limit buckets are removed in bounded batches. Used links and recovery-code digests remain as private operational history.

The native account schema is part of a **private database backup**, not the public website build or public map export. Existing intake-only or governance-only exports are not a complete account backup. Preserve the SQL migration files, current account schema and data, independent operator/access configuration, and the secret in its separate secure store when planning a handover. Never publish a whole D1 account export as a downloadable public artifact.

The server source, schema and API remain portable. A future hostname change still needs the passkey transition described above, and a receiving legal entity needs its own agreed operator and consent process. Moving technical records does not silently transfer legal obligations or membership.

## Verification and sources

Run `node --test tests/accounts-worker.test.mjs` for focused authentication checks. `tests/helpers/passkeys.mjs` creates test-only P-256 credentials and authentic WebAuthn registration/assertion structures; verification still uses the production library. Checks cover real signature validation, exact origins, browser binding, user verification, replay, bootstrap races, one-use links and codes, privilege/session revocation, idempotent invitations, version conflicts, preservation of a last webmaster/passkey and transactional rollback on audit failure.

Use the broader repository checks and a Worker runtime build before deployment. Production activation still requires the operator's actual secret and a real browser/device passkey ceremony; local test results do not claim that configuration has happened.

Primary implementation references:

- [SimpleWebAuthn server package](https://simplewebauthn.dev/docs/packages/server)
- [SimpleWebAuthn browser package](https://simplewebauthn.dev/docs/packages/browser)
- [Cloudflare D1 prepared statements and batch operations](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
