# Formation and governance hub

Implementation record, 27 November 2026.

## Direction

Luke confirmed that ready SET Co-op is a Straddie pilot intended to be reusable across up to 3,000 potential Installing the Missing Middle sites. He explicitly required an extension of the existing Cloudflare build and repository, with no ChatGPT Sites project or replacement hosting. This extension follows that direction.

The public experience introduces the local purpose first, then connects it to the legal process and practical tools. The wider network remains a proposal: a community, cooperative legal entity, physical installation and shared-service provider are distinct concepts. Local membership, cultural authority, project choices and obligations are not inherited from a national template.

## Delivered source

| Area | Implemented | Boundary |
| --- | --- | --- |
| Formation guide | Twelve connected preparation, approval, formation and operational steps, each with an evidence prompt | Progress is not a legal readiness certification |
| Structure comparison | Distributing, non-distributing with shares, and non-distributing without shares | Founders choose the structure; earlier distributing research remains a proposal |
| Queensland legal guide | Searchable topics, four legislative sources, official model rules, active membership, disclosure, formation, voting, registers and reporting | Queensland is the reviewed jurisdiction; other selections require local review |
| Founder planner | Explicit device save, restore, validated import, JSON export, Markdown discussion brief and unsaved-change warning | No network transmission or automatic private record creation |
| Financial scenario | Member capital, annual fee revenue, other revenue, operating costs, reserves and start-up funding balance | No tax, payroll, dividend, grant eligibility or full cash-flow engine |
| Preparation workbooks | Founder brief, rules, disclosure, formation meeting, decision record, handover and local replication | Editable prompts; official regulator forms and model rules remain separate |
| Private workspaces | Blank community creation, locality, jurisdiction, proposed structure and formation stage | Existing authorised organisers can access all workspaces on this deployment |
| Rules | Typed section, proposed text, rationale and model reference, with version history and document packs | No claim that a saved draft is approved or registered |
| Meetings and decisions | Agenda, notice/date/location, chair, attendance count, quorum evidence, motion, votes, result and references | Records human processes; does not run a statutory ballot or collect signatures |
| Membership | Prospective/applicant/admitted/exit evidence records and participation basis | No auto-admission from public EOI; no member sign-in or payment collection |
| Directors and roles | Appointment, term, delegation, conflicts and responsible person | Recording a role does not grant technical access or make a legal appointment |
| Finance and reporting | Typed records for budgets, shares, fees, reserves, reporting, amounts and approval references | Maintained accounts/payroll and official reporting remain separate |
| Service handover and assets | Original and receiving parties, scope, consent, acceptance, effective dates, ownership, custody and renewal | Contracts, property transfers and employment obligations require their actual agreements |
| Policies and risks | Version/review dates, scope, likelihood, impact, mitigation and responsible escalation | No automated legal judgement |
| History and portability | Signed-in actor, immutable origin/revisions, optimistic concurrency, complete bounded workspace exports | Full D1/SQLite backup is required for complete database recovery; exports do not assign sharing permissions |
| Replication | Reusable public prompts, a repeat-safe twelve-action checklist, blank workspaces and local-jurisdiction fields | No cloned people, consents, appointments or approvals; no fabricated sites |

## Current architecture

The Worker identity and database are unchanged: `ready-setco`, `ready-setco-operations`, existing `DB` and `ASSETS` bindings. Four empty governance tables are added by migration `0004_governance.sql`. Governance routes inherit authentication from `/api/admin/*` and reject cross-origin writes. The private interface remains inside `manage.html`.

Every current authorised organiser can access every workspace. This release provides useful separation of community records, not independent tenant access control. Before unrelated communities share one deployment, implement explicit workspace memberships, scoped permissions, invitations, revocation and audited role changes, or give each cooperative its own deployment and data custody. Do not market the pilot as a completed 3,000-tenant platform.

The participant EOI and public map are preserved. Their original exports keep their original scope. A workspace's private JSON export includes its current records and revision history; full database backup includes all domains. The public planner stores only when requested and does not call the private API.

## Legal source review

The public guide links the current Queensland application Act, applied National Law, National Regulation and local regulation, alongside OFT guidance. The review corrected the formation adoption denominator (two-thirds of attending proposed members), the different special-resolution voting denominators, the special-postal notice period and the first AGM deadline measured from registration. Current fees are linked rather than hard-coded.

Maintain the checked date and source version in `formation-data.js`. Keep a review note when law or regulator guidance changes. General source guidance does not replace a cooperative's registered rules or the evidence of a real decision.

## Maintenance and verification

```sh
node scripts/build-formation-pages.mjs
node scripts/refresh-shell.mjs
npm run check
npm test
npm run build
```

The shared navigation generator adds the hub, keeps Map visible, retains reading/language controls and updates the full Previous/Next sequence. The site directory includes 17 current public pages, three earlier research pages and one private organiser page.

Focused tests exercise the real Worker/SQLite path, authentication, origin restrictions, immutable attribution, idempotent creates, stale writes, rollback on audit failure, cross-workspace record substitution, complete exports, registration/admission/handover evidence, planner persistence and budget separation. Interface tests cover actual saves, reloads, safe document packs and repeated checklist imports.

Release verification on 27 November 2026: all 93 tests passed, the static build completed, and the existing Worker bundled successfully with `wrangler deploy --dry-run`. The source/link check covered 26 JavaScript files, 21 HTML pages and 915 local links/assets. These checks do not establish that production has been deployed or visually reviewed.

## Production completion

Source publication does not prove a Cloudflare deployment. Production completion requires applying the new migration to the existing database, deploying the existing Worker/assets, confirming the public pages and checking signed-out and authorised organiser access. Preserve existing Cloudflare Access configuration and credentials. There are no new public record endpoints.

## Further development for the wider network

Future work can add jurisdiction packs, formal member accounts, scoped office-holder permissions, secure evidence attachments, statutory register completeness reviews, properly designed ballots, regulator-form assembly, approved-publication workflows, finance integrations and federation agreements. Build each against the real local requirements and authority. The pilot's immediate service work and founding discussions can use the delivered tools independently of those later capabilities.
