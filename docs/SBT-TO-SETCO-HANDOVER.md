# Strange But True to Ready SETCO: launch and handover

Working operating plan, 19 November 2026.

Ready SETCO means **Ready Sustainable Employment and Training Cooperative**, the name preferred in the current brief. Historical documents also use Ready S.E.T. Co., SETCo, Straddie Employment and Training Company, and Employment & Training Agency. Preserve these aliases in the research catalogue; they do not establish separate registered entities.

## What starts now

Strange But True (SBT), Luke's existing sole-trader business, begins the practical services. The initial pilot is an island conference/event program: Luke teaches AI, develops software and produces content; employed guest-services staff welcome attendees, coordinate activities and help operate the events. Related proposals include island tours, music events and outdoor cinema.

Ready SETCO is being prepared in parallel to take on shared employment, training, administration and grant-supported programs as local businesses and community leaders participate. Until registration and the relevant operating arrangements are evidenced, describe it as a **proposed cooperative**. The public Trust Hub and Cultural Intelligence Node are existing guides; their existence does not establish cooperative registration, RTO status, labour hire licensing, partnership endorsement or a property agreement.

The software should support continuity from the first SBT pilot. Each contract, employment engagement and payment retains its actual legal party and dates as responsibility changes.

## Accountable roles

Assign people to these roles before each relevant stage. One person may hold several roles initially; record conflicts and use a separate reviewer for material approvals.

| Role | Accountable for | Evidence |
| --- | --- | --- |
| SBT operator | Initial contracts, staff, wages and delivery | Registrations, agreements, payroll references |
| Formation convener | Founder discussions and cooperative formation | Approved drafts, meeting notices and minutes |
| Membership registrar | Intake, corrections and admission records | Applications, decisions, member register |
| Finance/payroll lead | Budget, payroll provider and grant accounting | Reconciliations and restricted-fund records |
| Event/safety lead | Inductions, guest operations and incidents | Venue plans, attendance and action logs |
| System custodian | Access, backups and handover exports | Access reviews and successful restore checks |
| Elected board after registration | Cooperative decisions and delegated authority | Registration, resolutions and delegations |

## Four stages and their gates

### 1. Establish the SBT pilot

Set up PAYG withholding, working holiday maker employer registration, payroll, super and WorkCover as applicable. The user is arranging expanded insurance categories and public liability cover for the proposed activities. Keep the contracting business visible on bookings and employment documents.

Create a real guest-services position with duties, hours, location, supervision and pay conditions. Check the worker's visa conditions and record actual shifts and payment evidence. Tourism/event eligibility depends on the work performed and Home Affairs requirements; the portal must not promise that registration, a job title or a counter guarantees 88 days. Intermittent events may require a longer period to accumulate the required work.

**Gate:** SBT can lawfully employ and pay the first worker, deliver the event and produce records for it. The event/safety lead and finance/payroll lead confirm readiness.

### 2. Recruit participants and settle the cooperative design

Collect expressions of interest from businesses, residents, workers, training partners and community leaders. Ask what they can contribute, what help they need and whether they want to explore founding membership. Obtain separate permission for contact, publication and any proposed sharing.

The later research proposes a **distributing cooperative** owned by participating members. Retain this as the proposal for consultation. Decide the primary activity, active-membership requirements, classes if appropriate, member contributions, voting, surplus policy and delegated management before finalising rules.

Grant ambitions require a separate eligibility decision. Some programs accept trading entities; others require not-for-profit purposes or particular applicant types. GCBF, for example, recognises a cooperative legal form but separately requires not-for-profit operation and excludes sole traders and for-profit organisations. Assess a non-distributing structure, a separate eligible entity, or a genuine auspice arrangement against the intended programs. Do not silently replace the distributing proposal or assume charity, DGR or tax-exempt status.

**Gate:** founding participants have a documented structure decision, draft budget and clear service offer. Only the people and organisations that have actually agreed are described as participants.

### 3. Form and equip the cooperative

Follow Queensland's formation process: generally at least five members, proposed rules and any required distributing-cooperative disclosure approved before the formation meeting, adoption of rules, election of directors and registration. A cooperative generally needs at least three directors. Use the current Office of Fair Trading requirements for the intended structure.

Registration is followed by the cooperative's own ABN/tax arrangements, bank account, insurance, payroll arrangements and authorised signatories. Distinguish software support, outsourced administration, direct employment, labour supply and accredited training: each has different responsibilities.

**Gate:** verify the registration evidence, approved rules, board authority, operating registrations and service-specific permissions before treating the cooperative as an operating party.

### 4. Transfer defined services

Make a cutover schedule specifying which services transfer, their effective dates, outstanding invoices, assets, software/IP rights, records, permits, insurance and continuing SBT services. Obtain the necessary contractual consents or replacement agreements. Assess employee offers, continuity of service, entitlements and record-transfer duties under applicable business-transfer rules.

Record an explicit decision and responsible reviewer for each item. SBT can continue separately; formation does not require it to disappear. Historical work remains attributed to its actual employer and operator.

**Gate:** the elected board accepts the defined service, finance reconciles it, affected parties receive the relevant documents, and a complete export/restore check succeeds.

## The first software release

Use the Trust Hub for the invitation and shared explanation, with the Cultural Intelligence Node remaining a research/context entry point. Build one operational register behind the intake rather than collecting disconnected lists.

The register needs:

- Stable IDs for people and organisations, with an authorised contact and participation interests.
- Separate states for expression of interest, prospective founder, formal application, admission and exit. An EOI submission is not membership, employment or endorsement.
- Versioned consent and notices, limited visibility, correction/withdrawal routes and an audit trail of review decisions.
- Legal-entity records; each service agreement and employment engagement names its party, effective dates and authorisation.
- Training/induction evidence and verification status, without implying that an uploaded document has been verified.
- For the next workforce release, shifts, locations, approved hours, payroll-system references, incident actions and role prerequisites.
- A handover checklist showing evidence, owner, reviewer and decision date, with historical records preserved.

Keep established payroll, tax reporting and award interpretation in an appropriate maintained system. Integrate identifiers and approved hours; do not rebuild a statutory payroll engine for this first release. AI may assist with drafts, retrieval and reminders; a named person remains responsible for decisions.

Public intake should initially collect contact details and participation interests only. Do not import private research dossiers, passport images, tax file numbers, medical information or cultural material into the public website repository or a general EOI form. Private employment documents require a separate controlled process.

## Cloudflare now; island hosting later

The authorised starting platform is a Cloudflare Worker and a dedicated D1 database using SQLite-compatible migrations. Keep standard HTTP request/response formats and business rules separate from Cloudflare storage and identity adapters. Never mix this register with another project's operational database.

Maintain exportable stable IDs, schema versions, UTC timestamps and effective dates. Provide authorised JSON/CSV exports and database backups; include consent, review history and relationships in migrations, not just current contact rows. Store secrets outside source control and protect administrative access independently of public intake.

Before moving to island hardware, test a full export into local SQLite, compare record counts and relationships, verify access controls and restore a backup. If later choosing PostgreSQL, explicitly migrate and verify the schema. Publish a cutover window, reconcile new submissions and retain a rollback copy. Hosting migration and legal-entity handover are separate events and may occur on different dates.

## Expansion boundaries

SBT directly employing staff for its own conference is distinct from supplying those workers to independent local businesses. Before launching labour supply, assess Queensland labour hire licensing and obtain any required licence. Cooperative membership alone does not establish an exemption; shared safety duties also need documented coordination.

Ordinary AI workshops, induction and internal skills development can start within their actual scope. Nationally recognised VET delivery, assessment and qualifications require the appropriate RTO arrangements. Use an established RTO partner where appropriate and identify the real provider and qualification scope. A digital badge does not create an accredited qualification.

## Research reading map and corrections

Original PDFs remain private source material and are not bundled into this repository.

| Original PDF | Relevant pages | Use |
| --- | --- | --- |
| Ready SET Co. Business Strategy Development.pdf | 3-5, 8-14 | Proposed distributing model, service tiers, HRIS/LMS/WHS, buy-to-build, LOI/MOU |
| SETCo 2026 Pitch Plan Revision.pdf | 3-5, 8-9, 11-12 | Later structure pivot, service agreements, parallel employer archive/worker credentials, implementation |
| Straddie Employment & Training Agency – Foundational Layer Design.pdf | 2-4, 16-19 | Shared identity, permissions, onboarding MVP, portability and gradual integration |
| Straddie Employ and Train Co (SETCo) SOPs.pdf | 7-8, 15-16, 21-23 | Employment archive, host safety coordination and controlled credentials |
| SETCo Business Setup and Compliance.pdf | 8-13, 47-49 | Earlier legal options, IP and phased setup; later research supersedes parts |

Correct the October SOP's quarterly-super procedure to current Payday Super requirements. Earlier CLG/PBI assumptions, 2015 RTO-standard references, TSS terminology and proposed partnerships need current review. Research language describing an RTO, automated legal certainty or future approvals is not evidence of completed registration or approval. C-Hour, sponsorship and longer-horizon infrastructure remain separate proposals.

## Current official references

- [Queensland cooperative overview](https://www.qld.gov.au/community/fair-trading/associations-charities-and-non-for-profits/cooperatives/what-is-a-cooperative), [formation meeting](https://www.qld.gov.au/community/fair-trading/associations-charities-and-non-for-profits/cooperatives/registering-a-cooperative/hold-a-formation-meeting) and [board requirements](https://www.qld.gov.au/community/fair-trading/associations-charities-and-non-for-profits/cooperatives/run-a-cooperative/board-of-directors-for-a-cooperative).
- [GCBF applicant eligibility](https://www.justice.qld.gov.au/initiatives/community-grants/guidelines/eligibility), [labour hire licensing](https://www.labourhire.qld.gov.au/licensing) and [ASQA provider requirements](https://www.asqa.gov.au/for-providers/about-providers).
- [ATO WHM employer registration](https://www.ato.gov.au/businesses-and-organisations/starting-registering-or-closing-a-business/starting-your-own-business/registration-obligations-for-businesses/work-out-which-registrations-you-need/taxation-registrations/employer-registration-for-working-holiday-makers), [Payday Super](https://www.ato.gov.au/businesses-and-organisations/super-for-employers/about-payday-super) and [Home Affairs specified work](https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions).
- [Fair Work business transfers](https://www.fairwork.gov.au/employment-conditions/when-businesses-change-owners) and [employment records](https://www.fairwork.gov.au/pay-and-wages/paying-wages/record-keeping).
