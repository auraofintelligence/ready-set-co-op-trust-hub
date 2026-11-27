# Member accounts and local participation

Implemented 27 November 2026 in the existing `ready-setco` Worker and `ready-setco-operations` D1 database. The public formation, Queensland law, governance, planning and network information remains open. The portal is `/portal.html`; it loads private data only after server authentication.

## Existing Webmaster and first-installation setup

Luke has already established the Webmaster account on the live service. Sign in at `/portal.html`; administration opens by default. Account management, committee tools, organiser records and account security do not require completing a participant profile. **Open participant view** is an optional route to personal participation forms, with a direct return to administration. The current operator remains Luke Hayes trading as Strange But True, with public contact **sbt4183@gmail.com**.

The setup steps below apply only to a fresh installation. They are not a task for an existing Webmaster.

1. Open `/portal.html#setup`. Generate a private setup key in your own browser and copy it.
2. In Cloudflare, open **Workers & Pages → ready-setco → Settings → Variables and Secrets → Add**. Choose **Secret**, name it **READY_AUTH_SECRET**, paste the key, then **Deploy**.
3. Return to the setup page, select **Check setup**, enter your own account details, then choose and confirm a password. Saving the optional backup recovery codes is not required to enter the portal.

Keep `READY_AUTH_SECRET` configured after setup. The database permanently closes the initial Webmaster claim when setup succeeds. The secret value never belongs in Git, a build variable, this README or chat. The setup page generates it only on an explicit click and does not store it in browser storage. If the runtime secret is already configured, the password update needs no additional Cloudflare setting. The setup authorisation key and account password are separate. After setup, sign in with your username and password, or choose an optional passkey. Keep any recovery codes you choose to save privately. Once password accounts exist, changing the runtime secret requires a controlled rewrap of the encrypted server setup; see [authentication operations](MEMBER-AUTH.md).

This is a runtime secret for this Worker, separate from the existing Cloudflare build API token. No change to GitHub's selected-repository permissions is needed. The current dashboard path was verified against [Cloudflare's Worker secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/) on 27 November 2026.

The source can deploy safely before this secret exists. It shows an account-setup message and leaves native account creation closed. Deployment, operator activation and an authenticated production workflow check are separate states; do not describe all three as completed just because a build is green.

## People and permissions

| Person | Access |
| --- | --- |
| Visitor | Open public guides, public local-group descriptions, map and the existing expression-of-interest form |
| Account holder | Own profile, participation applications, response/history, recovery controls and own-data export |
| Group participant | The above plus private notices and document links for that explicitly assigned group |
| Group committee | Review that group's applications, publish/edit/archive its notices and manage its linked governance workspace |
| Webmaster | Account invitations/recovery/disable, local-group listings and access assignments, all governance workspaces, existing intake review and public-map moderation |
| Configured legacy Access organiser | Trusted global operator access, retained for compatibility |

The server checks roles. A hidden button is not an authorisation boundary. Role assignment is a technical permission and does not appoint a director, establish an employment role or confer voting rights. A governance `role` evidence record does not grant login access automatically.

The one configured `minjerribah` listing describes the proposed pilot and accepts participation applications. It does not create a cooperative legal entity, founder, registered member, decision or physical installation. Additional groups are created explicitly by the Webmaster. The list APIs paginate with a maximum of 100 records per response; scoped governance queries do not create one SQL parameter per group.

## Practical workflows

### A person taking part

Choose a username and password, save the profile and contact choices, then apply to an open group. The application retains its submitted name/contact snapshot, consent version and initial operator. An application can be reviewed, returned for more information, accepted for participation, declined or withdrawn. Repeating an identical submission with the same UUID does not create a duplicate. Reusing it with different data produces a conflict.

Accepting participation grants access to that group's information. Withdrawing that accepted application, or changing its review away from acceptance, removes the participant grant in the same database transaction. Explicit committee roles are separate and are removed by the Webmaster.

Contact email is unverified contact information. It cannot be used alone to claim an account or reset access. This release does not send invitations, notifications or recovery emails. Authorised operators may prepare one-use invitation/recovery links and share them with the verified recipient through their chosen private channel.

### A committee

The Webmaster assigns `committee` access to a named account for a specific group. That committee reviews applications and authors the group's private notices. Linking the group to a governance workspace gives its committee access to that workspace's records, history and export. Unlinked and other groups' workspaces remain inaccessible to them.

Group posts contain text and optional HTTPS document links. Document storage is not included: the linked document service still controls who can open it. An archived notice is removed from the participant feed while its saved history remains. Public site notices and the proposed shared-screen network are separate from these private group posts.

### Recording cooperative admission

The participation acceptance action is separate from `admitted`. Recording admission requires a linked governance workspace at `registered` or `operating`, its registration reference and date, and an actual admission date, decision reference and evidence reference. The admission date cannot precede registration or be in the future. The record documents a human decision; software does not perform the legal act.

The portal says **admission recorded**. This is a historical application outcome, not a current statutory active-membership certificate or voting eligibility calculation. Later resignation/cancellation and active-membership reviews belong in the governance membership records and the cooperative's real process; synchronising the full statutory lifecycle is further work. A Webmaster can remove technical group access independently when appropriate.

## API guide

Authentication, sessions and Webmaster account endpoints are documented in [MEMBER-AUTH.md](MEMBER-AUTH.md).

All writes require exact same-origin requests, JSON, an authenticated account where applicable and the Worker's 12 KiB streamed request limit. All API responses and portal HTML are `no-store`, with no-index headers. Native accounts use primary-consistent D1 session reads so a disabled account or revoked session cannot continue through stale replicas.

| Endpoint | Methods and purpose |
| --- | --- |
| `/api/member/sites` | GET public published-group descriptions; includes only the caller's own role when signed in |
| `/api/member/profile` | GET own profile; PATCH full editable profile plus `expectedVersion` (`0` for first save) |
| `/api/member/applications` | GET own applications; POST UUID, group, contribution details and explicit consent |
| `/api/member/applications/:id` | PATCH `expectedVersion` and `action: withdraw` or `resubmit` |
| `/api/member/applications/:id/history` | GET own application revisions |
| `/api/member/groups` | GET accessible groups and the caller's role; admission field means a recorded admission event |
| `/api/member/groups/:siteId/bulletins` | GET accessible group posts; committee POST creates a post |
| `/api/member/groups/:siteId/bulletins/:id` | Committee PATCH full content, `archived` and `expectedVersion` |
| `/api/member/export` | GET private own-profile/application/role/history JSON, without authentication credentials |
| `/api/committee/sites` | GET groups assigned to the committee, or all groups for Webmaster |
| `/api/committee/sites/:siteId/applications` | GET the selected group's application queue |
| `/api/committee/sites/:siteId/applications/:id` | PATCH review status, visible response, evidence and `expectedVersion` |
| `/api/committee/sites/:siteId/applications/:id/history` | GET the selected application's history |
| `/api/webmaster/sites` | GET all group listings; POST a group |
| `/api/webmaster/sites/:siteId` | PATCH listing, application availability and optional governance workspace link |
| `/api/webmaster/sites/:siteId/roles` | GET role assignments; PUT account ID, `participant`, `committee` or `none`, and `expectedVersion` |
| `/api/webmaster/sites/:siteId/roles/:accountId` | GET a single role assignment, or `null` for a new assignment |

List responses return `page`, `pageSize`, `total` and the named collection. The portal offers additional pages rather than silently treating the first page as the complete list. Profile/application field limits and review validation live in `cloudflare/member-services.mjs`. Account routes use their own bounded lists.

## Records, consent and portability

Migration `0005_member_accounts.sql` adds passkeys, accounts, sessions, single-use authentication challenges, recovery links/codes, throttles and authentication audit. Migration `0006_member_services.sql` adds profiles, local-group listings, group roles, applications, bulletins and immutable service history. Migration `0007_member_passwords.sql` adds password credentials, encrypted OPAQUE setup and temporary attempts, and records the authentication method on sessions. The original four migrations and the existing intake and map records are preserved.

The initial operator stays Luke Hayes trading as Strange But True in application snapshots. Updating a contact choice does not erase earlier submitted evidence or silently transfer it to a different entity. Future cooperative sharing remains an explicit choice and still requires its real handover process. No public profile directory or public member export is provided.

Private exports contain personal information and should remain in authorised storage. The own-record export deliberately excludes authentication secrets, credential public keys, session hashes and other people's records. Full database backups remain necessary for recovery of the complete service. A future host migration must preserve the public WebAuthn relying-party domain, or plan a verified passkey re-enrolment process; copying SQLite alone does not move passkey identity to a different domain.

## Verification and operating limits

The test suite uses real SQLite migrations and Worker requests, including real OPAQUE password proofs and P-256 WebAuthn signatures. It checks account claims and recovery, replay denial, same-origin protections, private-record isolation, stale writes, atomic audit rollback, consent withdrawal races, role revocation, admission evidence and lists spanning more than 100 groups. Browser-interface tests cover the default password flow, explicit optional passkey selection, cancellation, retained edits, safe text rendering, stable retry references and portal workflows.

The platform is a working pilot foundation, not a claim of a deployed or load-tested 3,000-site network. Payments, payroll, statutory ballots, file storage, verified-email delivery and automatic legal handover are not implemented by this member portal. Verify real password sign-in and recovery-code custody with the operator before inviting participants. Subsequent improvements should follow actual group needs without closing the substantial public information.
