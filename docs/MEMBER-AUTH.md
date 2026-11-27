# Private accounts, passwords and optional passkeys

This module adds real participant accounts to the existing ready SET Co-op Worker and D1 database. A person chooses a username and password, signs in, maintains their private participation information and applies to a local group. Creating an account does not admit someone to a cooperative, establish employment, transfer an earlier expression of interest or accept a future operator.

The public formation and governance hub remains open. The account portal is `portal.html`. Group applications, scoped committee access and membership evidence are handled separately by `cloudflare/member-services.mjs`. Account security is implemented in `cloudflare/accounts.mjs`.

## Existing service and initial setup

Use the existing Cloudflare Worker **ready-setco** and its **ready-setco-operations** D1 database. Do not create another Worker, database, authentication service or hosting project.

The initial Webmaster has already been established on this service, as confirmed by Luke on 27 November 2026. Use the existing sign-in and administration view. The following setup steps are retained for a fresh installation and must not be repeated for the established account.

1. Apply the repository migrations through the existing automatic deployment workflow. `0005_member_accounts.sql` adds the account schema; `0006_member_services.sql` adds participation services; `0007_member_passwords.sql` adds password credentials and protocol state. These migrations do not seed a person, password, passkey, cooperative or role.
2. Open **https://ready-setco.auraofintelligence.workers.dev/portal.html#setup**. Choose **Generate setup key**, then **Copy setup key**. This generates 32 random bytes in that browser and retains the value in the setup form. Keep the page open.
3. In Cloudflare, open **Workers & Pages → ready-setco → Settings → Variables and Secrets → Add**. Choose **Secret**, name it **READY_AUTH_SECRET**, paste the copied value, then choose **Deploy**. Keep a private copy somewhere secure. Use the Worker runtime section, not **Builds → Variables and secrets**. If the runtime secret is already configured, keep it; the password update does not require a second key. Do not paste it into a GitHub file, issue, message or public URL.
4. Return to the portal and choose **Check setup**. Supply a username, display name and contact email, choose and confirm your own password, and accept the account privacy information. The setup form retains the generated key for this step.
5. Optionally open the recovery-code disclosure and save the eight backup codes somewhere private and separate from the device. The codes are available during this response and are not required to continue into administration. Passkeys are optional and appear only when deliberately selected. A password manager or biometric enrolment is not required.
6. Verify that the portal identifies the new account as webmaster and that sign-out followed by password sign-in works. The webmaster can then establish local groups and explicitly assign scoped committee roles.

The first public registrant does **not** become webmaster. Bootstrap requires the configured setup authorisation key and a separately chosen account credential. Its permanent singleton record is created atomically with the webmaster account. After that, the setup key cannot establish a second initial webmaster, even if the secret is changed. Keep the secret configured: it remains the server key for private links, recovery codes, browser challenge bindings, rate-limit identifiers and encryption of the persistent password-protocol setup. It is never the member's account password.

The accepted secret syntax is 43 to 128 URL-safe characters. The browser generates 64 hexadecimal characters from cryptographically random bytes. There is no fallback to `RATE_LIMIT_SALT` or to a hard-coded key.

The session endpoint reports configuration and migration readiness without revealing the secret. Until setup is completed, the portal must describe the real state. Existing public pages and expressions of interest remain separate.

## What people use

The normal sign-in and account-creation forms use a typed username and password. A password must be nonempty and may contain up to 128 Unicode characters; there is no additional minimum length, mandatory mixture of symbols or periodic password change. Spaces and memorable phrases are allowed. The client normalises Unicode to NFC and never trims leading or trailing spaces. Password confirmation compares the same normalised values. Each account-password field has an explicit show/hide eye button and starts hidden. The initial setup form rejects reuse of the setup authorisation key as the account password.

An existing Webmaster opens directly into administration. Personal profile, applications and participant group screens load only when the Webmaster explicitly opens participant view. No participant profile is required for Webmaster permissions. Ordinary participants retain their personal portal. Switching views does not change the account, its roles or its saved records.

Passkeys remain available through an explicit optional choice. Normal password submissions do not call WebAuthn, and the username input does not request WebAuthn autofill. The browser may independently offer to save a password; accepting that offer is not required. The site does not enrol biometrics, connect a Microsoft or Google account or require a password manager. Optional passkeys use a browser/device/security-key authenticator; the site stores its public credential only.

### Password implementation

The self-hosted `@serenity-kit/opaque` package implements OPAQUE, a password-authenticated key exchange. The browser applies the package's `memory-constrained` Argon2id configuration: 64 MiB, three iterations and parallelism four. This work runs in a dedicated same-origin browser worker so the portal remains responsive. The password and temporary client state stay in that worker for the active attempt and are discarded on completion, cancellation or expiry. They are never written to browser storage, audit logs or D1. The server stores the resulting OPAQUE registration record. A successful login requires verification of the protocol's final proof before the existing session cookie is issued.

Password length and confirmation are client-side policy. OPAQUE deliberately does not reveal the typed password to the server, so the server cannot independently prove its length or strength. Server controls instead validate bounded protocol messages, authorisation, session and account versions, request limits and one-use attempt claims. Contact email is not a password reset authority.

The pinned npm package embeds WebAssembly. The build extracts its exact bytes and changes only module loading for Cloudflare's static-WASM requirement; it does not replace the cryptographic algorithm. Browser code is bundled from the same pinned package and served from this site. Only the portal's content policy permits `wasm-unsafe-eval`; general JavaScript `unsafe-eval` is not enabled. Browser workers are restricted to this origin.

The server creates one persistent OPAQUE setup and stores it encrypted in D1 with AES-GCM under a purpose-separated key derived from the existing `READY_AUTH_SECRET`. Concurrent initialisation uses the database winner. Existing encrypted setup is never silently regenerated after a decryption failure. Temporary server login state is encrypted separately and bound to the attempt. Losing or replacing the setup would invalidate password records, so back up the database and runtime secret together through separate private custody.

OPAQUE keeps the memory-hard password calculation in the browser. Local runtime checks do not establish production CPU headroom under every device, load or Cloudflare plan. Monitor actual authentication failures and runtime limits before claiming capacity. No paid external identity provider is added.
Use a stable public hostname. A passkey is bound to the hostname on which it was created. A later move to a different hostname needs a planned sign-in and passkey enrolment transition; copying the database alone does not make a passkey work on an unrelated domain.

Contact email is explicitly **unverified**. It is a contact field and must not be treated as verified identity, proof of group membership or an automatic account recovery destination.

An ordinary account has no global organiser access. A webmaster has global administration privileges. Committee permissions are scoped to groups in the member service, and formal cooperative admission requires its own recorded evidence. Verified legacy Cloudflare Access or explicitly configured loopback development authentication can remain webmaster fallbacks through the Worker; client headers containing an email or role do not grant access.

## Sessions and verification

The server uses `@simplewebauthn/server` to generate WebAuthn options and verify registration and authentication responses. It checks the exact request origin and hostname, challenge, user presence, user verification, credential public key and applicable authenticator counter. Registration supports ES256 and RS256 credentials. The browser uses the locally bundled `@simplewebauthn/browser`.

Each ceremony has a five-minute lifetime, purpose, exact origin and browser binding. Passkey ceremonies also carry a random challenge and relying-party hostname; password attempts hold protocol state in their separate table. A separate HttpOnly cookie binds the request to the initiating browser. No setup key, raw private link or recovery code is stored in a pending ceremony.

After cryptographic verification, an atomic D1 batch claims the ceremony. Only that batch's winning operation can change the account, store or update the credential, issue recovery codes, create a session and append the audit event. A replay cannot repeat those changes. Persistence failure rolls the complete batch back. Recovery claims also check the account version before consuming a one-use link or code.

Sessions last eight hours. The cookie is:

~~~text
__Host-ready_session=<opaque random token>; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=28800
~~~

D1 stores only the SHA-256 digest of the 256-bit random session token. Every native session lookup checks the account is active, the session has not expired and its authentication version still matches the account. The resolver makes no database query when no native session cookie is present. Permission changes, recovery and explicit revocation invalidate old sessions immediately through that version.

The five-minute ceremony cookie is `__Host-ready_ceremony`. Consumed ceremonies remain unusable even if the browser still has that cookie. One `Set-Cookie` header is emitted per response.

HTTP is permitted only for explicit `LOCAL_DEV=true` on loopback. Local development uses `ready_session_local` and `ready_ceremony_local`; production always requires HTTPS and the secure cookie names.

All account mutations require an exact same-origin `Origin`, JSON content type and a body no larger than 12 KiB. Cross-site mutations are rejected. Responses use `Cache-Control: no-store, private`. D1-backed request limits store keyed identifiers rather than raw IP addresses or attempted usernames. Authenticator verification attempts also have their own bound.

Password sign-in, password confirmation and password confirmation for replacement recovery codes share one account limit: three attempts within 15 minutes, starting from the first reserved attempt. The username is normalised before selecting that limit, so a different browser, device, IP address or password-confirmation route does not give the same account more attempts. The server reserves each attempt atomically before returning the password protocol response. Failed and abandoned starts count, including a wrong password detected by the browser before it sends a final proof. A successful, still-authorised password proof resets the applicable attempt window. After three unsuccessful or unfinished starts, further starts wait for that window to expire; blocked retries do not extend it. Separate, broader request limits remain for IP-level abuse without limiting an entire shared community connection to three requests.

Password changes, adding or removing passkeys and native webmaster account changes require a native session verified within the preceding five minutes. The portal asks for the current password by default while preserving form edits. Passkey confirmation is available only by explicit choice. Replacing recovery codes requires fresh password or optional passkey verification.

The portal clears the previous private view when a refreshed identity or role changes, or the server requires a new sign-in because the session is no longer valid. An ordinary mistyped password during confirmation preserves the current account's unsaved edits.

## Recovery and account management

Eight recovery codes are generated at enrolment, activation and successful recovery. Each code contains 160 random bits, is stored only as a domain-separated keyed digest and can be used once. Newly issued codes appear in a closed optional disclosure; saving them is not a gate before using the portal. Replacing the codes invalidates the previous set. The public operator contact is **sbt4183@gmail.com**; automatic email recovery remains unimplemented and the presence of that address is not a verification or delivery mechanism.

Recovery uses either a recovery code and username or a private recovery link explicitly prepared by a webmaster. The person chooses a replacement password by default, with optional passkey recovery available by explicit choice. Completion revokes the old password, passkeys, sessions, unused links and recovery codes, then installs the chosen replacement credential and issues a new session and eight new codes. A normal password change keeps explicitly added passkeys but revokes existing sessions and unused links and replaces the recovery codes. A disabled account cannot recover itself back to active status.

Password changes, passkey additions and recovery preserve the account's saved consent fields. Only explicit registration or invitation activation records account consent; a security action does not imply a new participant choice or replace an earlier consent version.

A webmaster can reserve an invited account and then prepare an activation link. Links are returned once and are not sent automatically. Activation links last 24 hours; recovery links last one hour. A new link revokes previous unused links for that account. The operator must verify the intended recipient through their established private process before manually sharing a link. Email alone is not verified by this software.

The portal places private invitation and recovery tokens in a URL fragment, reads that fragment locally and removes it from the address bar. Tokens are submitted in JSON only when the person chooses to continue. They must not be copied into public posts or support tickets.

Invited accounts activate with their own chosen password by default and explicit account consent; passkey activation is optional. Existing active accounts may be disabled and later re-enabled. Keep at least one active webmaster: the server enforces that condition inside the update batch, including concurrent changes. Accounts can have up to 20 active passkeys. Passkeys are revoked rather than deleted, and removing the last active sign-in credential is refused. An account with an active password can remove its final passkey.

If every webmaster loses their password, all optional passkeys and recovery codes and no verified legacy operator access remains, there is no public back door. Recovery then needs deliberate database-owner maintenance and a recorded operator decision. The permanent bootstrap record must not be removed to bypass this.

Changing `READY_AUTH_SECRET` invalidates outstanding keyed links, recovery codes and pending browser-bound ceremonies. It also prevents decryption of the existing OPAQUE setup unless that setup has been re-encrypted under the new key. Do not replace this secret after password accounts exist without a controlled rewrap and recovery plan using the old key. Automated server-key rotation is not included in this release. A secret change does not by itself invalidate already-issued session digests; use explicit session revocation as part of a planned rotation. Do not rotate the key as a routine redeployment step.

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
  "authentication": "password",
  "hasPassword": true
}
~~~

Examples are schema illustrations only. No example identity is installed.

Usernames are lower-case ASCII, 3 to 40 characters, beginning with a letter or number and continuing with letters, numbers, full stops, underscores or hyphens. Display names allow 1 to 120 characters. Contact email is bounded to 254 characters.

### Default password endpoints

The browser worker starts a password registration and sends only `registrationRequest` alongside the ordinary account, consent or recovery fields. Options return `{ceremonyId,registrationResponse}`. The browser completes registration and submits `{ceremonyId,registrationRecord}`. Raw passwords are never API fields.

| Endpoint pair | Options body and purpose |
| --- | --- |
| `/api/auth/password/register/{options,verify}` | Registration fields and `registrationRequest`; ordinary participant account |
| `/api/auth/password/bootstrap/{options,verify}` | Registration fields, separate `bootstrapKey` and `registrationRequest`; one initial webmaster |
| `/api/auth/password/activate/{options,verify}` | Private `token`, explicit consent and `registrationRequest` |
| `/api/auth/password/recover/{options,verify}` | Private `token` or username plus recovery code, and `registrationRequest` |
| `/api/auth/password/change/{options,verify}` | Recent native session and `registrationRequest`; add or replace own password |
| `/api/auth/password/login/{options,verify}` | Username and `startLoginRequest`; new session |
| `/api/auth/password/reauth/{options,verify}` | Current session and `startLoginRequest`; fresh verification for the same account |
| `/api/auth/password/recovery-codes/{options,verify}` | Current session and `startLoginRequest`; replace recovery codes |

Login options return `{ceremonyId,loginResponse}`. The browser completes the protocol and submits `{ceremonyId,finishLoginRequest}`. Verification returns the public identity, a session cookie and recovery codes where applicable. The session endpoint also reports `passwordAvailable`; the signed-in identity reports `hasPassword`. Unknown usernames and incorrect passwords do not receive account details.

### Optional passkey endpoints

For these existing routes, options return `{ceremonyId,options}` and verification accepts `{ceremonyId,response}`, where `response` is the browser library's WebAuthn result. Authentication ceremonies use `startAuthentication`; registration ceremonies use `startRegistration`. They are invoked only by an explicit passkey choice.

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

Migration `0007_member_passwords.sql` adds password credentials, encrypted persistent setup, short-lived password attempts and a session authentication-method column. Migration `0005_member_accounts.sql` adds nine tables: accounts, the permanent bootstrap singleton, passkeys, sessions, private links, recovery codes, short-lived ceremonies, request-limit buckets and account audit events. It adds indexes and origin/history protection triggers. Existing intake, map and governance records are preserved.

Account origins and usernames are immutable in this API. Account, passkey and audit records have no delete path. Disabled accounts and revoked passkeys retain their history. Account audit events are append-only and use the server-resolved actor, timestamp and action; they never contain setup keys, raw tokens, recovery codes or browser authenticator responses.

Expired sessions, ceremonies and attempt-limit buckets are removed in bounded batches. Used links and recovery-code digests remain as private operational history.

The native account schema is part of a **private database backup**, not the public website build or public map export. Existing intake-only or governance-only exports are not a complete account backup. Preserve the SQL migration files, current account schema and data, independent operator/access configuration, and the secret in its separate secure store when planning a handover. Never publish a whole D1 account export as a downloadable public artifact.

The server source, schema and API remain portable. A future hostname change still needs the passkey transition described above, and a receiving legal entity needs its own agreed operator and consent process. Moving technical records does not silently transfer legal obligations or membership.

## Verification and sources

Run `node --test tests/accounts-worker.test.mjs` for focused authentication checks. `tests/helpers/passkeys.mjs` creates test-only P-256 credentials and authentic WebAuthn registration/assertion structures; verification still uses the production library. Checks cover real signature validation, exact origins, browser binding, user verification, replay, bootstrap races, one-use links and codes, privilege/session revocation, idempotent invitations, version conflicts, preservation of a last webmaster/passkey and transactional rollback on audit failure.

Use the broader repository checks and a Worker runtime build before deployment. The existing initial Webmaster has been established by the operator. Automated account tests use isolated fictional records; verification of private production actions uses the existing authorised account separately. Password tests use real OPAQUE registration and proofs, while the runtime test exercises static WebAssembly under workerd.

Primary implementation references:

- [OPAQUE registration and login](https://opaque-auth.com/docs/get-started/add-to-existing-project)
- [OPAQUE key stretching](https://opaque-auth.com/docs/advanced_usage/key-stretching)
- [OPAQUE RFC 9807](https://www.rfc-editor.org/rfc/rfc9807.html)
- [Cloudflare WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
- [SimpleWebAuthn server package](https://simplewebauthn.dev/docs/packages/server)
- [SimpleWebAuthn browser package](https://simplewebauthn.dev/docs/packages/browser)
- [Cloudflare D1 prepared statements and batch operations](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
