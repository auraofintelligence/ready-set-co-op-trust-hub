# Formation and governance workspace

Implemented 27 November 2026 as an extension of the existing `ready-setco` Cloudflare Worker and its dedicated `ready-setco-operations` D1 database.

The workspace records preparatory work, evidence and human decisions. Saving a status does not register a cooperative, admit a member, appoint an officer, conduct a ballot or transfer property. Official acts remain with the relevant people, legal entities and regulator. The public participation intake remains an expression-of-interest service and is not imported into a membership register automatically.

## Deployment and access

Apply `migrations/0004_governance.sql` to the existing database before deploying the extended Worker. The migration adds four tables and indexes. It does not insert a cooperative, participant, director, approval or legal status, and does not change the existing participant or map tables.

```sh
npx wrangler d1 migrations apply ready-setco-operations --remote
npm run build
npx wrangler deploy
```

Use the existing `wrangler.jsonc`, account, Worker and database. The organiser interface remains inside `manage.html`. Native Webmaster accounts can manage all workspaces. Native committee accounts can manage only workspaces linked to their explicitly assigned local groups. Workspace lists, individual reads and writes enforce that scope; permission checks inside write transactions also prevent a concurrent role revocation from authorising a stale operation. Global intake and map moderation remain Webmaster functions.

The existing verified Cloudflare Access allowlist and loopback development token remain optional global operator routes. Missing authentication fails closed. Account activation uses one private Worker secret and a one-use Webmaster setup. See [member services](MEMBER-SERVICES.md) and [authentication](MEMBER-AUTH.md). A missing governance migration returns `503 governance_setup_required` rather than changing the schema during a public request.

Software committee access is separate from a legal appointment. A governance role record does not grant login access. Webmasters explicitly assign that access in the portal, preserving its audit history. Webmasters and configured legacy Access organisers are trusted global operators, so communities sharing this deployment also share that stewardship boundary.

## Requests and responses

All mutation requests use `Content-Type: application/json` and the same origin as the protected management page. Bodies inherit the Worker's 12 KiB streamed limit. Individual normalised record content is limited to 10 KiB. IDs are UUIDs; create operations use a client-generated UUID retained for identical retries. A successful create returns `201`; an identical retry returns `200` with the same record and no new revision. Reusing an ID for different initial content returns `409 submission_conflict`. This comparison uses the immutable original payload even after later edits.

Updates require `expectedVersion`, a positive integer copied from the displayed record. The entire editable record is submitted. Omitted optional text fields become empty, so callers must retain fields they are not changing. Versions increase monotonically. A stale write returns `409 version_conflict` without changing the record or its history. Original IDs, workspace associations, kinds, creation timestamps and original actors cannot be edited. There are no delete endpoints; records can be archived with history intact.

The server owns `createdBy`, `updatedBy`, `createdAt`, `updatedAt` and `version`. Attempts to submit these fields are rejected. Owner fields describe the person responsible for follow-up and do not grant access or replace the signed-in actor.

| Method and route | Result |
| --- | --- |
| `GET /api/admin/governance/workspaces` | `{workspaces,total,page,pageSize}` |
| `POST /api/admin/governance/workspaces` | `{workspace}` |
| `GET /api/admin/governance/workspaces/:workspaceId` | `{workspace}` |
| `PATCH /api/admin/governance/workspaces/:workspaceId` | `{workspace}` |
| `GET /api/admin/governance/workspaces/:workspaceId/history` | `{revisions,total,page,pageSize}` |
| `GET /api/admin/governance/workspaces/:workspaceId/records` | `{records,total,page,pageSize}` |
| `POST /api/admin/governance/workspaces/:workspaceId/records` | `{record}` |
| `GET /api/admin/governance/workspaces/:workspaceId/records/:recordId` | `{record}` |
| `PATCH /api/admin/governance/workspaces/:workspaceId/records/:recordId` | `{record}` |
| `GET /api/admin/governance/workspaces/:workspaceId/records/:recordId/history` | `{revisions,total,page,pageSize}` |
| `GET /api/admin/governance/workspaces/:workspaceId/export` | Complete private workspace export within the stated size limits |

List endpoints accept `page` and `pageSize` (1 to 100, default 100). Record lists also accept optional `kind` and `status`. Unsupported query parameters are rejected. Histories are newest version first. Every record lookup and history query binds both workspace ID and record ID. Supplying a record from another workspace returns `404` and does not disclose its contents.

## Workspace fields

Creation accepts `id`, `name`, `locality`, `jurisdiction`, `cooperativeType` and optional `purpose`. Every new workspace starts at `exploring` with no registration evidence. Updates accept the editable fields below plus `expectedVersion`.

| Field | Contract |
| --- | --- |
| `name` | Required text, maximum 160 characters |
| `locality` | Required text, maximum 160 characters |
| `jurisdiction` | `QLD`, `NSW`, `VIC`, `TAS`, `SA`, `WA`, `ACT`, `NT`, `other`; default `QLD` |
| `cooperativeType` | `undecided`, `distributing`, `non-distributing-shares`, `non-distributing-no-shares` |
| `purpose` | Optional text, maximum 2,000 characters |
| `stage` | `exploring`, `drafting`, `regulator-review`, `formation-meeting`, `registration-pending`, `registered`, `operating` |
| `registrationRef` | Evidence reference, maximum 600 characters |
| `registrationDate` | Calendar date in `YYYY-MM-DD` format |

The `registered` and `operating` stages require both a registration reference and date. They are organiser-recorded claims with an audit trail, not automatically verified legal statuses. `jurisdictionReview` is generated by the server: `qld-guide-available` for Queensland, otherwise `local-review-required`. Selecting a state does not apply Queensland legislation to that state.

## Record fields

Create with `id`, `kind` and the editable fields below. Updates keep the original ID and kind, and add `expectedVersion`.

| Field | Contract |
| --- | --- |
| `kind` | `task`, `rule`, `meeting`, `decision`, `membership`, `role`, `finance`, `handover`, `policy`, `asset`, `risk` |
| `title` | Required text, maximum 180 characters |
| `status` | `draft`, `in-review`, `approved`, `completed`, `archived`; default `draft` |
| `owner` | Follow-up responsibility, maximum 160 characters |
| `dueDate` | Optional calendar date |
| `sourceRef` | Official source or reference, maximum 600 characters |
| `evidenceRef` | Decision, approval or completion evidence reference, maximum 600 characters |
| `body` | Notes, maximum 4,000 characters |
| `details` | Type-specific object; permitted fields below |

`approved` and `completed` require an evidence reference. References can name controlled documents or decisions without uploading their contents. All fields are plain text, dates, booleans or bounded integers; arbitrary objects and unknown fields are rejected. Dates must be real calendar dates, not merely date-shaped strings. No fees, share payments or money movements are executed by these records.

### Type-specific details

All details are optional unless a status rule below requires them. Text fields default to a 600-character maximum except where another limit is shown. Empty optional text is omitted from the normalised details object.

| Type | Permitted details |
| --- | --- |
| `task` | `milestone`, `dependency`, `completionCriteria` (1,500) |
| `rule` | `section`, `proposedText` (3,000), `rationale` (1,000), `modelRuleReference` |
| `meeting` | `meetingType` (`formation`, `board`, `general`, `agm`, `other`), `scheduledDate`, `noticeDate`, `location`, `chair`, `minuteTaker`, `agenda` (2,000), `attendanceCount` (integer), `quorumRequirement`, `quorumConfirmed` (boolean), `minutesRef` |
| `decision` | `resolutionType` (`ordinary`, `special`, `board`, `formation-rules`, `other`), `meetingRef`, `motion` (2,000), `eligibleVotes`, `votesFor`, `votesAgainst`, `abstentions` (integers), `outcome` (`proposed`, `carried`, `not-carried`, `deferred`, `withdrawn`), `decisionDate`, `thresholdBasis`, `conflicts` (1,000) |
| `membership` | `memberRef`, `memberName`, `memberType` (`individual`, `body-corporate`), `applicationDate`, `admissionDate`, `participationReviewDate`, `activeMembershipBasis` (1,000), `membershipStage` (`prospective`, `applicant`, `admitted`, `resigned`, `cancelled`), `decisionRef`, `consentRef` |
| `role` | `roleName`, `holderName`, `appointmentDate`, `termEnd`, `appointmentRef`, `delegation` (1,500), `conflicts` (1,000) |
| `finance` | `category` (`budget`, `shares`, `fees`, `reserves`, `reporting`, `other`), `amountCents` (integer), `currency` (`AUD`), `period`, `basis` (1,000), `restrictions` (1,000), `approvalRef` |
| `handover` | `fromEntity`, `toEntity`, `scope` (1,500), `effectiveDate`, `consentRef`, `acceptanceRef`, `liabilities` (1,000), `recordsPlan` (1,000) |
| `policy` | `topic`, `versionLabel`, `reviewDate`, `approvalRef`, `scope` (1,500) |
| `asset` | `assetRef`, `legalOwner`, `custodian`, `location`, `servicePlan` (1,500), `renewalDate`, `licenceRef` |
| `risk` | `likelihood` and `impact` (`low`, `medium`, `high`), `mitigation` (2,000), `reviewDate`, `trigger`, `escalationTo` |

Calendar fields use `YYYY-MM-DD`. Counts are non-negative safe integers up to one billion; `amountCents` accepts up to one trillion cents. Votes plus abstentions must not exceed the stated eligible-vote count when one is supplied. The system does not calculate that a motion has lawfully passed: the applicable notice, quorum, eligibility, rule, statutory threshold and meeting evidence still matter.

A decision outcome of `carried` requires a decision date, meeting or ballot reference and evidence reference, even while the overall record is a draft. The overall drafting status cannot bypass evidence for that outcome claim.

An `admitted` membership record additionally requires a workspace at `registered` or `operating`, an admission date, a decision reference and an evidence reference. Formation participants can be recorded as prospective members or applicants while registration is being prepared. An approved or completed handover requires both legal parties, an effective date, a consent reference and an acceptance reference. These validations improve record completeness; they do not replace the underlying agreements.

## History, export and replication

Every successful create or update appends a full immutable revision in the same database transaction as its current record. Revision responses contain `id`, `workspaceId`, optional `recordId`, `version`, `actor`, `createdAt`, and a direct `snapshot` object. Database triggers prevent history updates/deletes and changes to original record identity. If a revision insert fails, the current-record change rolls back.

The export contains `schemaVersion: 1`, `exportedAt`, `workspace`, `records`, `workspaceRevisions` and `recordRevisions`. The reads share a single transaction. Exports never include another workspace or public participant intake. Export responses are private and not cached. They support up to 5,000 records, 20,000 workspace revisions and 20,000 record revisions, with a 4 MiB JSON-content limit per collection. A larger workspace returns `413 export_too_large` so the organiser can use the existing complete D1/SQLite backup procedure. The API does not silently truncate an export.

The existing `/api/admin/export` remains the participant register export and `/api/admin/map/export` remains the private map export. Neither is a complete database backup and neither now includes governance records. Use the new workspace export for governance, and the documented full D1 SQL export for a backup or migration of every table. The existing portability rehearsal covers participant and map records; the new governance Worker tests cover governance persistence and transactional history. A full production restore rehearsal still needs to include all four governance tables.

The first pilot can create a blank workspace for its actual founding process. Other communities can create their own blank workspaces or operate the code in their own deployment. Reusing an educational checklist does not copy another community's people, consent, approvals, registration, appointments or audit history. There is no blanket clone endpoint and no assumed federation authority. Wider network scale is a design goal, not evidence that 3,000 cooperatives or sites already exist.

## Verification

```sh
node --test tests/governance-worker.test.mjs
```

The tests exercise real Worker requests and the portable SQLite adapter: valid and invalid identity, same-origin restrictions, empty initial state, durable retries, stale updates, immutable actor history, atomic rollback, record/workspace scoping, complete exports, typed fields and evidence requirements, pagination, jurisdiction labels, and missing migration behaviour. These checks do not establish live Cloudflare Access setup, successful production deployment, legal registration or real membership.
