# ready SET Co-op | Learn. Work. Build together.

**Ready Sustainable Employment and Training Cooperative**

ready SET Co-op (Ready SETCO in earlier documents) is a proposed member-owned cooperative starting on Minjerribah / North Stradbroke Island, Queensland. It brings together local skills, employment, training, volunteer coordination, shared resources and the practical support needed to turn community ideas into useful, sustainable services.

It is a proposed **minimum viable community for a fair go in the age of superintelligence**: start with the people, capabilities, equipment and coordination that a community needs, then repeat the useful foundations in other places with locally chosen priorities and peer relationships. The long-term direction is Joyful Responsible Abundance, not a centrally imposed community programme.

**Open information and private participation, 27 November 2026:** the five-page formation and governance hub remains open on the existing Cloudflare site. This repository also contains a member portal with username and password as the default, optional passkeys, durable personal profiles and applications, local group notices, committee permissions and Webmaster account controls. The directory contains 22 entries: the same 20 public information pages, the member portal and the protected organiser workspace. Automatic deployment from `main` updates the existing Worker and database.

**Webmaster access:** Luke Hayes has established the initial Webmaster account, confirmed by the operator on 27 November 2026. Use the existing account at [the portal](https://ready-setco.auraofintelligence.workers.dev/portal.html). Webmaster sign-in opens administration; a participant profile is optional and is accessed through a separate participant view. The existing operator is Luke Hayes, trading as Strange But True, with public contact **sbt4183@gmail.com**.

**Setup is already complete for this service.** The one-time `#setup` route is for a fresh installation only. Keep the existing private Worker runtime secret, `READY_AUTH_SECRET`, configured. This dashboard update does not recreate the Webmaster, change their password or require another Cloudflare setup. Future deployments can follow [member access and operations](docs/MEMBER-SERVICES.md).

**Committee invitations, 28 November 2026:** the Webmaster administration view now has a dedicated invitation register. Choose a person and local group, prepare their private invitation link, and follow its pending, expired, accepted or cancelled status. The Webmaster can replace unused links, cancel invitations or explicitly reopen a cancelled invitation. The recipient sees the group and committee access before accepting; access is granted when their account activation succeeds.

**Courses, learning and work profiles:** the private portal provides group courses, saved progress, assessed practicals and completion records. The course builder includes two Point Lookout Fishing Club drafts covering officer handover and volunteer onboarding. Profiles also record participation preferences and requests to check qualifications and skills. See [learning and work records](docs/LEARNING-AND-WORK.md). Visitors can [try a sample volunteer lesson](https://ready-setco.auraofintelligence.workers.dev/join.html#try-a-lesson) before signing in or sending an enquiry.

Strange But True is the initial sole trader operator. ready SET Co-op remains proposed; cooperative formation, formal member admission, employment arrangements and service handovers require their actual decisions and agreements.

## Open the co-op hub

| Live page | What it helps with |
| --- | --- |
| [Formation & governance](https://ready-setco.auraofintelligence.workers.dev/formation.html) | Follow the twelve-step formation pathway and compare distributing and non-distributing cooperative structures |
| [Queensland law & rules](https://ready-setco.auraofintelligence.workers.dev/cooperative-law.html) | Find the legal sources, official model rules and guidance on disclosure, membership, voting and reporting |
| [Running the cooperative](https://ready-setco.auraofintelligence.workers.dev/governance.html) | Plan membership, responsibilities, decisions, finance, records and service handover |
| [Formation planning tools](https://ready-setco.auraofintelligence.workers.dev/formation-planner.html) | Prepare a device-held draft, explore a first-year budget and download seven preparation workbooks |
| [Other communities](https://ready-setco.auraofintelligence.workers.dev/cooperative-network.html) | Adapt the foundations locally and explore the proposed Missing Middle network |

The [Members & decisions](https://ready-setco.auraofintelligence.workers.dev/members.html) page connects this preparation to founding participation. The public tools help people prepare and discuss; saving a plan does not register a cooperative or admit a member.

## Two public entry points, one repository

| Site | Role |
| --- | --- |
| [ready SET Co-op on Cloudflare](https://ready-setco.auraofintelligence.workers.dev/index.html) | Current public site and live co-op hub, with same-origin Worker API, dedicated D1 register and public place data |
| [ready SET Co-op Trust Hub on GitHub Pages](https://auraofintelligence.github.io/ready-set-co-op-trust-hub/) | Public project information and source-linked research from this repository; operational requests point to the Cloudflare API |

Both sites are maintained from this repository. The 19 November 2026 rebuild supersedes the earlier property-led front door without erasing its history. The GitHub Pages edition is not a second operational database.

The existing GitHub connection now builds and deploys `main` to the same Cloudflare Worker. See [automatic deployment below](#automatic-cloudflare-deployment) for the current commands and verified release, and [the operating guide](docs/AUTOMATIC-DEPLOYMENT.md) for connection settings and troubleshooting.

The repository's original substantive build date remains 21 May 2026. The current operational rebuild began on 19 November, with map and contribution improvements on 20 November and the live formation and governance extension on 27 November.

## Who can help shape it?

Local businesses, community organisations and community leaders, including clubs, cultural organisations, health services and their workers and volunteers, are invited to help form the cooperative. Residents, people seeking work or training, backpackers and visitors can connect through the activities that suit them.

- Develop opportunities for locals and backpackers on equal terms, with properly agreed paid roles, mentoring and training.
- Support year-round livelihoods through visitor experiences, guest services, events and local businesses.
- Coordinate shared equipment, skills, information and community projects without requiring everyone to join the same programme.
- Recognise voluntary human contribution separately from paid employment.
- Invite prospective members to choose the rules, priorities, primary activities and responsibilities of the cooperative together.

The site is not a recruitment agency advertising confirmed vacancies, a registered training organisation, a guarantee of working-holiday visa eligibility or an already registered cooperative.

## Public site guide

The 20 public pages comprise 17 current pages, including the five hub pages linked above, and three labelled earlier research pages. The remaining current pages are listed here. The member portal and organiser workspace are separate entries outside the public reading sequence; private records require an authorised sign-in.

The **Co-op hub** menu groups Start a co-op, Queensland co-op law, Governance & decisions, Formation planner, Co-op network, Members & participation and Member portal & sign in. **About** groups the project introduction, sources, site directory and three labelled earlier research pages. Events, Training & work, Notices & media, Grants, Support and Map have direct menu links, with **Take part** as the participation action.

| Page | Purpose |
| --- | --- |
| [Home](https://ready-setco.auraofintelligence.workers.dev/index.html) | Local invitation, learning, work, shared services and founding participation |
| [Events & experiences](https://ready-setco.auraofintelligence.workers.dev/events.html) | Proposed AI conferences, music, outdoor cinema, visitor experiences and guest services |
| [Training & work](https://ready-setco.auraofintelligence.workers.dev/jobs.html) | AI and digital confidence, practical training, mentors, paid work and voluntary C-Hours |
| [Notices, news & media](https://ready-setco.auraofintelligence.workers.dev/media-assets.html) | Noticeboard first project, checked information, stories, media skills and disruption/recovery support |
| [Grants](https://ready-setco.auraofintelligence.workers.dev/grant-roadmap.html) | Project readiness, evidence, scope, budget, applicant and delivery planning |
| [Permissions & support](https://ready-setco.auraofintelligence.workers.dev/boundaries.html) | Consent, permissions, responsibilities, compliance and practical safeguards |
| [Map](https://ready-setco.auraofintelligence.workers.dev/map.html) | Find useful places, submit quick pins or detailed observations, suggest corrections and export public records |
| [Members & decisions](https://ready-setco.auraofintelligence.workers.dev/members.html) | Formation, member choice, decision records and future operational handover |
| [About](https://ready-setco.auraofintelligence.workers.dev/about.html) | Repeatable community foundations, the Missing Middle and longer-term stewardship |
| [Take part](https://ready-setco.auraofintelligence.workers.dev/join.html) | Durable expressions of interest, consent and submission receipts |
| [Sources & connected work](https://ready-setco.auraofintelligence.workers.dev/ecosystem-links.html) | Related public projects and research foundations |
| [Site directory](https://ready-setco.auraofintelligence.workers.dev/site-map.html) | Website navigation, distinct from the geographic map |

The earlier [Trust Ladder](https://ready-setco.auraofintelligence.workers.dev/trust-ladder.html), [Ballow Road](https://ready-setco.auraofintelligence.workers.dev/ballow-road.html) and [Horizon](https://ready-setco.auraofintelligence.workers.dev/horizon.html) pages preserve earlier research. They do not establish venue access, property ownership, a member-approved programme or installed infrastructure. The protected organiser page is not in the public reading tour.

## Employment, learning and local capability

The proposed starting areas include AI and digital literacy, conference/event operations, guest services, photography, interviewing, editing, local information checking, project administration, grant evidence, equipment stewardship and mentoring.

Paid work needs a named legal employer or contractor, an agreed task, pay and conditions, suitable training and a responsible supervisor. The starting business is [Strange But True](https://auraofintelligence.github.io/strange-but-true/), operated by Luke Nathan Hayes (ABN 81 913 657 174, as published on the site). Future responsibilities may move to the cooperative only through an agreed and documented process.

The [working holiday pathway](https://ready-setco.auraofintelligence.workers.dev/jobs.html#backpacker-work) leads to a distinct enquiry interest in the participation form. It is designed to help people explore lawful tourism, hospitality and guest-services work as roles develop. The page contains dated visa-transition guidance checked on 19 November 2026; verify the current Home Affairs requirements, actual employer, activity and location before relying on it. The site does not approve visa days or promise a job.

### Voluntary C-Hours

One verified C-Hour recognises one freely given human hour, with no monetary equivalent. Paid employment, financial investment, machine time/output and project outcomes have separate records.

A future personal Aura of Intelligence or agent could help a person document a contribution and choose what to share. This website explains the proposed model but does not run a C-Hour ledger, automatic verification, personal AI agent or compulsory public timesheet. See [C-Hour Introduction](https://auraofintelligence.github.io/C-Hour-introduction/).

## First proposed shared project: Straddie Noticeboard Network

The [current Cloudflare Noticeboard Network](https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/) is a separate implementation and the first proposed project for cooperative stewardship. Its current public service and publisher arrangements must be considered separately from ready SET Co-op formation.

The intended everyday network connects residents, businesses, clubs, community groups and visitors through useful local notices, events, service information, websites and shared screens. It incorporates the disruption and recovery principles of [Aura Disaster Resilience](https://auraofintelligence.github.io/aura-disaster-resilience/): preserve the original issuer, issue and checked times, expiry and the difference between current, cached and demonstration information. Official emergency authorities retain responsibility for emergency directions.

[Minjerribah Screen & Media Network](https://auraofintelligence.github.io/minjerribah-screen-media-network/) is the current media-planning gateway; [Ready SET Co-op Hyperlocal Media](https://auraofintelligence.github.io/ready-set-co-op-hyperlocal-media/) provides complementary foundations. Media contributors can learn source checking, consent, interviews, photography, editing, captions and portrait/landscape production.

A cooperative handover, publisher network and synchronisation of shared displays require agreed authority, participating organisations, equipment responsibilities, costs and operating procedures. The Trust Hub itself does not implement the noticeboard publishing/synchronisation service.

## The community map

The map is the first practical public observation layer in a much wider local-data architecture. It helps people find, add and correct places such as businesses, beaches, clubs, bus stops, seats, picnic facilities, toilets and drinking-water points.

### Current map capabilities

- Search and explore Minjerribah, Southern Moreton Bay Islands, Redlands or all recorded places.
- Load map backgrounds only by choice. Start with a satellite/aerial view fitted closely to Straddie, with an alternative road-map layer and retained attribution.
- Explicit Find me control displays temporary GPS position and accuracy without silently adding private location information to a submission.
- Reversible expanded/full-screen browser view, optional place list, keyboard support and map navigation.
- Directions open Google Maps for the selected public destination and chosen mode, without exporting the visitor's GPS origin. OpenStreetMap links are also available.
- **Quick pin:** tap an empty map location, optionally add a name and send the pin for review without typing or completing a questionnaire.
- **Detailed entry:** choose a category, optional icon, coordinates, source, observed date, useful description, access, accessibility, facilities and chosen public credit.
- **48 labelled illustrated icons** across clubs/sports/culture, businesses/services and facilities/public services, with search, filters and a category default.
- Suggest a correction to a published place, retain device drafts where supported and distinguish a saved receipt from an uncertain response.
- Download published records as GeoJSON; keep private submissions and review history out of public output.

Public mapping is a contribution and review workflow, not automatic publication. A successful submission returns a durable reference. The original report, chosen publication permission, source, review outcome and revision history are preserved. The system does not seed real places automatically or presume that previous map data is verified for this collection.

### Map record model

| Table | Role |
| --- | --- |
| `map_suggestions` | Original submissions, source and permission, review decision |
| `map_places` | Stable public place identity and current published/archived version |
| `map_revisions` | Append-only published and archived versions |
| `map_audit_events` | Submission, publication, rejection and archive history |

Private organiser decisions publish, reject, correct or archive public places. Version checks prevent a stale correction from silently replacing a newer record. The public export contains published information only; the private export preserves the complete record history for authorised stewardship.

The road and aerial map layers are separate third-party backgrounds; their data and licence rights are not transferred by local ownership of the place register. Read [map data and portability](docs/MAP-DATA.md) and [map icon artwork](docs/MAP-ICON-ART.md).

### From map to Sensorium

The map is deliberately narrow and useful now, while preserving stable IDs, source dates, location precision, permissions and revision history that can later support shared equipment, notices, assets, scans, digital twins and the wider Web3 Sensorium.

Personal and home information remains under the person's own authority. Public places do not give a community automatic access to private Auras. The larger architecture allows overlapping community spaces rather than imposing a rigid hierarchy.

The [community media pathway](docs/COMMUNITY-MEDIA-PATHWAY.md) proposes separate consent-controlled photo, panorama and 360-degree media records, building on the Gumpi ferry terminal and Ballow Road evidence maps. Permanent storage and publication require approval; media metadata, private object storage and verified contributor roles are future work, not features of the current map. See [Sensorium growth constraints](docs/SENSORIUM-GROWTH.md).

## Functional member portal

[Open the member portal](https://ready-setco.auraofintelligence.workers.dev/portal.html). It is part of the same Worker and dedicated D1 database.

| Area | Working implementation |
| --- | --- |
| Accounts | Username and password registration and sign-in by default, optional passkeys, password changes, eight-hour private sessions, optional one-use recovery codes, manual invitations and recovery links, account disable and session revocation |
| Personal records | Participant profile, contact and future-handover consent, versioned updates and own-data export; a Webmaster does not need to complete this profile to administer the service |
| Participation | Apply to a published local group, track responses, supply requested information, withdraw, and read saved history |
| Local groups | Private notices, meeting information and document links; committee authoring and archival |
| Committee | Review applications for assigned groups; accept participation separately from recording evidenced cooperative admission |
| Committee invitations | Webmaster-managed invitations for a named local group, with private activation links, status, search, pagination, renewal, cancellation and explicit reopening; committee access starts only after successful acceptance |
| Webmaster | Opens directly to administration: manage accounts, local group listings and scoped access; use committee, intake, map review, formation and account-security tools; switch to participant view only when wanted |
| Public information | The same substantial guides, law sources, planner and public participation form remain open without signing in |

People choose and type their own password. Passwords must be nonempty, with no additional minimum length or mandatory character mixture; the input accepts up to 128 Unicode characters. An inline eye button lets people show or hide each password while typing. Password attempts share a server-enforced three-attempt limit per account within 15 minutes, including attempts abandoned before verification. Changing device or IP address does not reset that account limit. A successful password verification resets the applicable attempt window.

Passkeys are an explicit optional choice; visiting the page or choosing the normal password flow does not request device authentication. A browser may independently offer to save a password, but accepting that offer is not required. Newly issued recovery codes sit in a closed optional disclosure; saving or dismissing them is not a prerequisite for using the portal. They can be used once to restore account access if the person loses their password. An authorised Webmaster can also prepare an expiring private recovery link after verifying the intended recipient.

To invite a new committee account, open **Webmaster → Committee invitations → Create a committee invitation**, enter the person's name, contact email and username, choose the local group, then prepare and privately share the link. The link lasts 24 hours and is shown only when created or replaced. It is not emailed automatically. If the person already has an active account, use **Manage account → Group responsibilities** to assign their access instead of creating a duplicate account. Accepted invitations retain their history; later access changes use the account's group responsibilities.

An unused invitation grants no committee access. Acceptance creates the account's group role and records the invitation acceptance together. Replacing or cancelling a link invalidates any activation already started with that link. Invitation management is restricted to the Webmaster and records who made each change; it does not appoint a cooperative director or record statutory membership.

**Email recovery is still outstanding.** The public contact address **sbt4183@gmail.com** identifies the current operator, but the portal has no connected email-delivery or verified-email password-reset service. It does not automatically send recovery or invitation emails. Contact email is not treated as verified identity. Group access, software account status, an admission record and current legal/voting rights are separate concepts.

Password authentication uses the standard OPAQUE protocol with client-side Argon2id hardening. The server stores a password registration record, not the typed password. The existing runtime secret protects the server's persistent protocol setup in D1; there is no additional authentication service or manual secret to configure. See [authentication details and key rotation constraints](docs/MEMBER-AUTH.md) before moving or changing server credentials.

Read [the service and API guide](docs/MEMBER-SERVICES.md) and [authentication details](docs/MEMBER-AUTH.md). Accounts are initially operated by Strange But True. Later sharing or transfer to a cooperative still needs the recorded consent and agreed handover process.

## Participation and formation register

The Cloudflare service provides public expression-of-interest intake. Native Webmaster accounts can use the private human-review workspace after initial activation. Existing configured Cloudflare Access organisers remain supported. An expression of interest remains separate from formal cooperative membership, employment and voting rights.

The public form accepts an individual, local business, community organisation/leader or work/training enquiry, with relevant interests and optional context. An organisation representative confirms authority to enquire. The applicant separately agrees to contact by Strange But True and may opt in to future sharing with the registered cooperative.

A server-confirmed receipt follows durable persistence; canonical retries reuse the reference instead of duplicating records. Submitting an expression of interest does not publish a map pin or confer membership, employment, partnership or funding rights.

The organiser workspace code at `manage.html` includes participant review, follow-up status and notes, audit history and portable export, alongside the private map review queue. The Worker accepts native Webmaster sessions or the existing verified Cloudflare Access organiser identity for global intake and map review. Native committee accounts see only their linked governance workspaces. Use the [established Webmaster account](docs/MEMBER-SERVICES.md#existing-webmaster-and-first-installation-setup) for authorised saves and export checks. The earlier Access-only release returned `503 admin_unavailable` while its identity configuration was absent; native accounts now provide a separate supported access route.

No public participant lookup or register export is provided. Do not collect passport scans, tax file numbers, banking details or other unnecessary sensitive records through public intake.

## Formation and governance hub

The 27 November extension implements Luke's direction: Straddie is the first ready SET Co-op pilot, with reusable foundations for up to 3,000 potential Missing Middle sites. This is the intended scale of a proposed network, not evidence of registered cooperatives, funded installations or a single national ownership structure. Each community chooses its own purpose, membership, governance and projects. A physical site, legal entity and shared service are distinct.

The five public pages provide a twelve-step formation pathway, the three cooperative configurations, Queensland legal and model-rule references, ongoing governance guidance, and a community replication approach. The public planner stores nothing until the visitor chooses to save on their device. It supports validated JSON import/export, a discussion brief, seven blank preparation workbooks and a first-year calculator that separates capital from trading income. It does not send drafts to a server or create an organiser record. Other jurisdictions are explicitly marked for local review.

The protected `manage.html#governance` implementation includes multiple formation workspaces, eleven typed record areas, reusable formation actions, revision history, actor attribution, optimistic version checks, private JSON exports and printable document packs. It now accepts native Webmaster sessions and explicit committee assignments as well as the optional existing Access route. These tools record evidence and human decisions; they do not register an entity, run a legal ballot, automatically admit a member, grant an office holder access, collect money or execute a handover.

The `/api/admin/governance/*` routes enforce the signed-in account's workspace scope and same-origin rules. Native committee roles are checked when reading workspaces and inside mutation transactions; a Webmaster or configured Access organiser retains global stewardship access. Automatic deployment applies unrecorded migrations, including `0004_governance.sql`, to the existing dedicated database before deploying the Worker. No participants, memberships or legal statuses are seeded. Migrations `0005_member_accounts.sql` and `0006_member_services.sql` add account and participation services; `0007_member_passwords.sql` adds password authentication to the same accounts; `0008_committee_invitations.sql` records pending committee invitations. Only a public listing for the proposed Minjerribah pilot is seeded, with no legal status, member or decision. Deployment and verification of an authorised private workflow remain distinct.

Native committee access is assigned per local group and extends to that group's linked governance workspace. Participants can read their own records and notices from groups they are allowed to access. Webmasters and configured legacy Access organisers remain trusted global operators. Pagination and scoped queries support growth without treating the proposed 3,000-site network as an already deployed or load-tested installation. Separate community deployments and data custody remain available choices. Read [the governance API and data model](docs/GOVERNANCE-API.md) and [the implementation matrix](docs/FORMATION-GOVERNANCE-HUB.md).

Public source prompts live in `formation-data.js`; page content is maintained in `scripts/build-formation-pages.mjs`. After changing either source, regenerate and apply the shared navigation:

```sh
node scripts/build-formation-pages.mjs
node scripts/refresh-shell.mjs
npm run check
npm test
npm run build
```

## Handover from Strange But True

The intended transition has four stages:

1. Establish an initial SBT pilot with clear contracts, responsibilities and paid work arrangements.
2. Recruit prospective founders and settle the cooperative design, including purpose, active membership, voting, governance, financial arrangements and delegated authority.
3. Form and equip the cooperative through the appropriate legal and member decisions.
4. Transfer specifically agreed services, assets, information and responsibilities, with authority, consent, costs, effective dates, training and maintenance arrangements recorded.

Earlier research describes a proposed distributing cooperative. That is a consultation proposal, not a registered entity or a settled rulebook. Historical names and proposals remain evidence of development.

Each handover retains the original operator, receiving legal entity, approved scope, consent, effective date and historical records. A software change cannot transfer an employment contract or statutory responsibility. See [launch and handover](docs/SBT-TO-SETCO-HANDOVER.md).

## Repository guide and architecture

| Component | Implementation |
| --- | --- |
| Public interface | Static HTML/CSS/JavaScript, shared shell, local Archivo fonts, vendored Leaflet and tide-mark artwork |
| Formation pages and tools | `scripts/build-formation-pages.mjs` maintains the five pages; `formation-data.js`, `formation.js` and `formation.css` hold the public guidance, planner and presentation |
| Private organiser interface | `manage.html`, `manage.js` and `governance-workspace.js` / `.css`; native Webmaster access and scoped committee governance access |
| Cloudflare Worker | `cloudflare/worker.mjs`, shared HTTP API and protected asset routes |
| Member accounts and services | `cloudflare/accounts.mjs`, `cloudflare/member-services.mjs`, `portal.html/js/css`, migrations `0005` through `0008`; passwords, optional passkeys, sessions, recovery, committee invitations, profiles, applications, local roles and notices |
| Records and private governance | `cloudflare/repository.mjs`, `cloudflare/map-records.mjs` and `cloudflare/governance.mjs`, using SQLite-compatible queries and transactions |
| Persistent database | Dedicated D1 database `ready-setco-operations`, bound as `DB` |
| Migrations | `migrations/0001_intake.sql` through `0008_committee_invitations.sql`, tracked by Wrangler |
| Local operation | Node.js 24+ native SQLite and loopback-only server using the same Worker interfaces |
| Static deployment | Allowlisted `dist/` bundle built by `scripts/build.mjs`; private data, server source and local credentials excluded |
| Production deployment | `wrangler.jsonc`, `scripts/check-deploy-target.mjs` and the `build:cloudflare` / `deploy` package scripts |
| API configuration | `operations-config.js` selects the Cloudflare API for GitHub Pages and same-origin API for Cloudflare/local operation |
| Tests | Node test runner, jsdom, interface, map controls/records, security, reading and translation checks |
| Operating documentation | `docs/`, including [automatic deployment](docs/AUTOMATIC-DEPLOYMENT.md), [Cloudflare operations](docs/CLOUDFLARE-OPERATIONS.md) and [governance API](docs/GOVERNANCE-API.md) |

Core public API routes include `POST /api/intake`, `GET /api/health`, `GET /api/map/places`, `POST /api/map/suggestions` and `GET /api/map/export`. Participant administration, map review and governance records remain protected under `/api/admin/*`.

Cloudflare is the initial hosting and storage adapter. The same SQL migrations, standard HTTP interfaces, stable identifiers and export history support a later move to agreed local island servers. The documented 19 November portability rehearsal exercised local D1 export, native SQLite restoration and matching participant/map history and public GeoJSON. This is not proof of a completed live production backup or migration.

Read [Cloudflare operations](docs/CLOUDFLARE-OPERATIONS.md) before changing infrastructure. Preserve the existing Worker and dedicated D1 database, not another project's database or identity policy.

## Automatic Cloudflare deployment

The existing `ready-setco` Worker is connected to this GitHub repository. A push to `main` runs checks, tests and the public asset build, then verifies the production target, applies unrecorded D1 migrations and deploys to the existing Worker. A failed check or migration stops deployment. The deploy command retains dashboard-configured variables with `--keep-vars`; native account activation and any optional Access configuration remain separate runtime requirements.

| Setting | Current value |
| --- | --- |
| Repository and production branch | `auraofintelligence/ready-set-co-op-trust-hub`, `main` |
| Root directory | Repository root, `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy` |
| Preview builds | Disabled |
| Runtime for the build | Node.js 24 from `.nvmrc`, with the pinned npm version in `package.json` |

For the normal release workflow, check the changes locally, push the intended source changes to `main`, then follow the **Workers Builds: ready-setco** GitHub check or **Workers & Pages → ready-setco → Deployments → View build history**. Confirm the intended commit and check the affected live pages. The [automatic deployment guide](docs/AUTOMATIC-DEPLOYMENT.md) covers repository access, the dedicated build token, migration behaviour and troubleshooting.

The first successful automatic release was verified on **27 November 2026**, before native member accounts were added. This table retains that release's original evidence:

| Evidence | Identifier or result |
| --- | --- |
| Source commit | [`2ba425f42f948ffbccd99b4ba09d8c19062bc19e`](https://github.com/auraofintelligence/ready-set-co-op-trust-hub/commit/2ba425f42f948ffbccd99b4ba09d8c19062bc19e) |
| Cloudflare build | `ed315537-9958-4f49-86dc-fdefe4814878`, succeeded |
| Worker version | `c4cc9c0b-370b-4f60-82a8-619516a78077` |
| Public verification | All five new hub pages returned HTTP 200; the directory contains 21 pages and the public site has 20 page URLs |
| Private verification at that release | `/manage.html` and `/api/admin/governance/workspaces` returned `503 admin_unavailable`; no organiser access was configured at that point |

Later releases added native accounts and password sign-in. Luke has since established the Webmaster account. The current portal opens that account into administration, with participant forms available only through an explicit optional view. The historical `503` result above is not the current account-activation status.

Migrations must remain compatible with the running Worker. A successful migration remains applied if a later Worker upload fails. Preserve the existing database and use one production deployment path; the scripts do not add a distributed migration lock.

## Accessible design and maintenance

Phone-first design uses readable body text, large touch targets, visible focus, safe-area spacing, reduced-motion preferences and the purple, blue, yellow and green tide identity.

The 20 public-page reading sequence includes the three labelled earlier research pages. Larger-text/high-contrast and language controls appear on public pages. Larger-text mode preserves the content and forms, with 24px body text, larger headings and a single-column layout. Browser preferences can be selected with `?view=easy` or `?view=normal`.

Optional browser read-aloud starts only on request and excludes form inputs, hidden material, dialogs and status messages. Browser translation and assistive tools support the public reading experience; neither adds an autonomous AI assistant.

Maintainers should read [AGENTS.md](AGENTS.md) and the [accepted rebuild brief](docs/REBUILD-BRIEF.md). Shared shell and footer helpers preserve scoped page content and the public reading sequence:

- `scripts/refresh-shell.mjs`: navigation, metadata, footer and favicon references.
- `scripts/refresh-public-details.mjs`: public page sequence and visible Strange but True colour markup.
- `scripts/check-site.mjs`: page links, anchors, images, headings and map navigation.
- `scripts/generate-map-icons.mjs`: preparation of the labelled map icon library.

### Run and check locally

Use Node.js 24 or newer.

```sh
npm ci
npm run check
npm test
npm start
```

The local server binds to http://127.0.0.1:8792 by default and applies migrations to an ignored local SQLite database. It does not copy or modify production D1. A temporary local administrative token is printed at startup and must not be used for production or saved in source. Use an isolated test-data directory for rehearsals.

```sh
npm run build
node scripts/verify-portability.mjs
```

The build prepares the public asset bundle; the portability script performs a local fictional-data rehearsal. `npm run build:cloudflare` runs the same checks, tests and asset build used by the automatic pipeline without deploying. Production releases follow the GitHub `main` connection described above. The current `wrangler.jsonc` already specifies the existing Worker and dedicated database; retain these when following older initial-setup documentation.

## Current and connected project foundations

| Project | Role |
| --- | --- |
| [Strange But True](https://auraofintelligence.github.io/strange-but-true/) | Starting legal operator, service development and project doorway |
| [Straddie Noticeboard Network](https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/) | First proposed shared project, distinct operational platform |
| [Point Lookout Fishing Club digital clubhouse](https://plfc-clubhouse.auraofintelligence.workers.dev/) | Example of a separate community club platform with its own committee authority |
| [Minjerribah Screen & Media Network](https://auraofintelligence.github.io/minjerribah-screen-media-network/) | Media skills and creative collaboration |
| [Ready SET Co-op Cultural Intelligence Node](https://auraofintelligence.github.io/ready-set-co-op-cultural-intelligence-node/) | Proposed local compute, cultural collaboration and training context |
| [Installing the Missing Middle](https://auraofintelligence.github.io/installing-the-missing-middle/) | Locally stewarded productive infrastructure, training, financing and ownership |
| [Mutual Futures](https://auraofintelligence.github.io/mutual-futures/) | Shared ownership, business succession, mentoring and productive renewal |
| [Stradbroke Grants Lab](https://auraofintelligence.github.io/stradbroke-grants-lab/) and [Straddie Tenders Lab](https://auraofintelligence.github.io/straddie-tenders-lab/) | Funding, procurement, evidence and project readiness |
| [Aura Disaster Resilience](https://auraofintelligence.github.io/aura-disaster-resilience/) | Community information, disruption, resilience and recovery planning |
| [UNGA81 contribution](https://auraofintelligence.github.io/UNGA81-Luke-Hayes/) | Wider independent research into locally shaped participation and Joyful Responsible Abundance |

These connections describe research, implementation lineage or potential cooperation. They do not establish outside approval or partnership.

## Further development and decisions

- The first Webmaster is established. Continue checking account administration, revocation, member applications and scoped committee access through that existing account; no repeat setup is needed.
- Connect and verify an email delivery and password-reset path before describing email recovery as available. Keep backup codes optional and manual recovery links available to authorised Webmasters.
- Confirm the live governance schema and complete an approved live intake/receipt check; retain the distinction between a successful public deployment and verified private operations.
- Establish the founding group and agree legal registration, primary activity, membership, employer/contract arrangements, insurance, safety, training and financial responsibilities.
- Agree which services and assets may transfer from SBT, especially the proposed Noticeboard first project, with consent and a documented decision.
- Develop community map stewardship, place verification and media approval policies, then separately implement the proposed media, C-Hour and wider Sensorium integrations when authorised.
- Rehearse backups, exports and restores with the authorised production environment before a future local hosting cutover.

The current release can record an evidenced cooperative admission after registration. It does not itself perform legal admission, determine current active membership or voting eligibility, run payroll, verify accredited training, approve visa days, transfer employment, collect payments, administer cooperative votes or replace legal review.

## Licence and historical links

Original project material is available under the [Strange But True Public Source Licence](LICENCE.md), not an open-source licence. Non-commercial use is permitted subject to its attribution and other terms. Commercial and institutional rights remain reserved as stated in the licence. Third-party fonts, libraries, imagery and map data retain their respective rights.

The earlier automated organisation relationship block is retained below for historical discovery. Current operational links and role descriptions above take precedence over older prototype destinations; an evidenced relationship is not a commitment.

<!-- github-organisation:start -->

## Project links and history

- First substantive build: 21 May 2026.
- GitHub repository: [ready-set-co-op-trust-hub](https://github.com/auraofintelligence/ready-set-co-op-trust-hub).
- Public site: [visit the public site](https://auraofintelligence.github.io/ready-set-co-op-trust-hub/).

## Related public projects

Each link below reflects an evidenced family, lineage or direct connection. This project has 27 relevant public connections.

### Aura Systems Image Atlas source projects

- [aura-systems-image-atlas](https://github.com/auraofintelligence/aura-systems-image-atlas) - [public page](https://auraofintelligence.github.io/aura-systems-image-atlas/) - source project represented in this visual atlas.
- [ballow-road-sand-screen-hub](https://github.com/auraofintelligence/ballow-road-sand-screen-hub) - [public page](https://auraofintelligence.github.io/ballow-road-sand-screen-hub/) - explicit cross-reference, shared community programme.
- [explorer-music-video-lab](https://github.com/auraofintelligence/explorer-music-video-lab) - [public page](https://auraofintelligence.github.io/explorer-music-video-lab/) - shared community programme.
- [mineral-moonshots](https://github.com/auraofintelligence/mineral-moonshots) - [public page](https://auraofintelligence.github.io/mineral-moonshots/) - explicit cross-reference, shared community programme.
- [moreton-bay-community-wealth-and-mutuals](https://github.com/auraofintelligence/moreton-bay-community-wealth-and-mutuals) - [public page](https://auraofintelligence.github.io/moreton-bay-community-wealth-and-mutuals/) - explicit cross-reference, shared community programme.
- [quandamooka-country-events-engine](https://github.com/auraofintelligence/quandamooka-country-events-engine) - [public page](https://auraofintelligence.github.io/quandamooka-country-events-engine/) - shared community programme.
- [quandamooka-film-festival](https://github.com/auraofintelligence/quandamooka-film-festival) - [public page](https://auraofintelligence.github.io/quandamooka-film-festival/) - shared community programme.
- [shared-table-initiative](https://github.com/auraofintelligence/shared-table-initiative) - [public page](https://auraofintelligence.github.io/shared-table-initiative/) - shared community programme.

### Direct and other supported connections

- [grain-by-grain](https://github.com/auraofintelligence/grain-by-grain) - [public page](https://auraofintelligence.github.io/grain-by-grain/) - explicit cross-reference.

### Funding, procurement and project-readiness workbenches

- [community-club-builder-sandy-sports](https://github.com/auraofintelligence/community-club-builder-sandy-sports) - [public page](https://auraofintelligence.github.io/community-club-builder-sandy-sports/) - explicit cross-reference, shared community programme, shared tooling suite.
- [legal-memory-workbench](https://github.com/auraofintelligence/legal-memory-workbench) - [public page](https://auraofintelligence.github.io/legal-memory-workbench/) - shared tooling suite.
- [moreton-bay-autonomous-mobility](https://github.com/auraofintelligence/moreton-bay-autonomous-mobility) - [public page](https://auraofintelligence.github.io/moreton-bay-autonomous-mobility/) - explicit cross-reference, shared tooling suite.
- [stradbroke-grants-lab](https://github.com/auraofintelligence/stradbroke-grants-lab) - [public page](https://auraofintelligence.github.io/stradbroke-grants-lab/) - shared community programme, shared tooling suite.
- [straddie-tenders-lab](https://github.com/auraofintelligence/straddie-tenders-lab) - [public page](https://auraofintelligence.github.io/straddie-tenders-lab/) - shared tooling suite.
- [windemere-skate-bowl-tender-workspace](https://github.com/auraofintelligence/windemere-skate-bowl-tender-workspace) - [public page](https://auraofintelligence.github.io/windemere-skate-bowl-tender-workspace/) - shared tooling suite.

### Island publication and community operations

- [ready-set-co-op-hyperlocal-media](https://github.com/auraofintelligence/ready-set-co-op-hyperlocal-media) - [public page](https://auraofintelligence.github.io/ready-set-co-op-hyperlocal-media/) - explicit cross-reference, shared community programme.
- [straddie-content-assets-kit](https://github.com/auraofintelligence/straddie-content-assets-kit) - [public page](https://auraofintelligence.github.io/straddie-content-assets-kit/) - shared community programme.
- [straddie-disaster-kiosks](https://github.com/auraofintelligence/straddie-disaster-kiosks) - [public page](https://auraofintelligence.github.io/straddie-disaster-kiosks/) - shared community programme.
- [straddie-news](https://github.com/auraofintelligence/straddie-news) - [public page](https://auraofintelligence.github.io/straddie-news/) - shared community programme.
- [straddie-night-market-lab](https://github.com/auraofintelligence/straddie-night-market-lab) - [public page](https://auraofintelligence.github.io/straddie-night-market-lab/) - shared community programme.
- [straddie-noticeboard-network](https://github.com/auraofintelligence/straddie-noticeboard-network) - [public page](https://auraofintelligence.github.io/straddie-noticeboard-network/) - shared community programme.

### Ready SET and Minjerribah media network

- [film-club-documentary-builders](https://github.com/auraofintelligence/film-club-documentary-builders) - [public page](https://auraofintelligence.github.io/film-club-documentary-builders/) - shared community programme.
- [grain-by-grain-documentary](https://github.com/auraofintelligence/grain-by-grain-documentary) - [public page](https://auraofintelligence.github.io/grain-by-grain-documentary/) - shared community programme.
- [minjerribah-screen-media-network](https://github.com/auraofintelligence/minjerribah-screen-media-network) - [public page](https://auraofintelligence.github.io/minjerribah-screen-media-network/) - explicit cross-reference, shared community programme.

### Regional wealth and resilience architecture

- [Minjerribah-Resilience](https://github.com/auraofintelligence/Minjerribah-Resilience) - [public page](https://auraofintelligence.github.io/Minjerribah-Resilience/) - shared community programme.
- [Redland_Flow](https://github.com/auraofintelligence/Redland_Flow) - [public page](https://auraofintelligence.github.io/Redland_Flow/) - explicit cross-reference, shared community programme.
- [Redlands_draft_ES2026-2031](https://github.com/auraofintelligence/Redlands_draft_ES2026-2031) - [public page](https://auraofintelligence.github.io/Redlands_draft_ES2026-2031/) - shared community programme.

<!-- github-organisation:end -->

