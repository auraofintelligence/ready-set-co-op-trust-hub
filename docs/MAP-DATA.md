# Community map data

This is the first durable place-record foundation for Ready SETCO's local map. It supports a local, repeatable part of the wider Web3 Sensorium direction. A point register is one component of that direction; it does not implement a digital twin, sensor network or the entire Sensorium.

## What is implemented

- People submit a new place or a correction with a chosen position, category, useful details, source and permission to display the information publicly.
- Suggestions remain in a private review queue. Only an organiser's publication decision creates or changes a public place.
- The published map exposes GeoJSON points. Pending submissions, review notes and organiser identities stay out of public responses and public downloads.
- Each correction names the published place and the version it changes. An organiser cannot silently publish a stale correction over a newer record.
- Archived places disappear from public output while the private register retains their previous versions, submitted evidence and decision history.
- Public GeoJSON and private register exports provide portable records. The same SQL and transactional interface run on Cloudflare D1 and local SQLite.

No real places are seeded by the migration. Test places are fictional and exist only in isolated tests.

## Records and stewardship

The appended migration `0003_map_records.sql` creates four tables:

| Table | Role |
| --- | --- |
| `map_suggestions` | Immutable original payload, source details and display permission, plus its review decision. |
| `map_places` | The latest published or archived place, its stable ID and version. |
| `map_revisions` | An append-only snapshot for each published or archived version. |
| `map_audit_events` | Append-only submission, publication, rejection and archive events. |

Original suggestions and their consent/operator fields cannot be rewritten or deleted. Revisions and audit events cannot be updated or deleted. The initial and current operator are recorded as Strange But True; this feature does not implement a legal or data-stewardship handover. Such a change needs its own agreed workflow and preserves the original records.

Categories are `business`, `bus_stop`, `picnic`, `seat`, `toilet`, `club`, `beach`, `water` and `other`. Bus stops can record marked, unmarked or unknown status, and shelter is an independent facility. A suggestion can also record seating, picnic tables, barbecues, toilets, drinking water, shade, accessible toilets, baby-change facilities, power and dog-friendly facilities. Access and step-free access have an explicit unknown state.

The first form deliberately collects no private email, phone or account details. Public credit is optional and must be the credit the contributor has chosen to display. Plain text remains plain text; the map interface must use text nodes rather than interpret supplied names or descriptions as HTML.

## Routes

| Route | Behaviour |
| --- | --- |
| `GET /api/map/places` | Published GeoJSON, with category/search/bounds filters and explicit pagination metadata. |
| `POST /api/map/suggestions` | Submit a pending new point or correction; exact retries receive the same reference. |
| `GET /api/map/export` | Download published GeoJSON, with the same optional filters. More than 5,000 matching places returns an explicit error rather than an incomplete export. |
| `GET /api/admin/map/suggestions` | Private queue, defaulting to pending; supports published, rejected and all stages. |
| `POST /api/admin/map/suggestions/:id/review` | Publish or reject with the queue record's `expectedUpdatedAt`. |
| `PATCH /api/admin/map/places/:id` | Archive a published place using its `expectedVersion` and a reason. |
| `GET /api/admin/map/export` | Download the full private register, revisions and audit events from one consistent database snapshot. |

Reading parameters are `category`, `search` (or `q`), `bbox=west,south,east,north`, `limit` (default 200, maximum 500) and `offset`. Pagination reports `total`, `limit`, `offset` and `hasMore`. Geographic export uses standard `[longitude, latitude]` coordinate order.

A suggestion requires a UUID `submissionId`, `name`, `category`, numerical `latitude` and `longitude`, `sourceType`, `publicationConsent: true` and `consentVersion: "2026-11-19"`. Optional public details are `locationDescription`, `description`, `access`, `wheelchair`, `facilities`, `stopMarking`, `sourceUrl`, `observedOn` and `publicCredit`. Corrections additionally require `placeId` and its positive `baseVersion`. Unknown fields are rejected. HTTP(S) source links may not contain sign-in credentials. An observation date must be a real date.

The first successful save returns `201` with `{status:"received", reference, duplicate:false}`. A canonical retry returns `200` with the same reference and `duplicate:true`; changed details under the same submission reference return `409`. A reference is returned only after the suggestion and audit event are committed together.

Review input is `{decision:"publish"|"reject", expectedUpdatedAt, notes?}`. Review output includes `suggestion` and, on publication, a GeoJSON `place` feature. Archive input is `{status:"archived", expectedVersion, reason}`. Private queue rows include a `data` object with the submitted public details and separate review fields. The API never treats an expression of interest or map listing as cooperative membership.

## Parent Worker integration

`handleMapRequest(request, env, {actor, now, readJSON})` returns a response for map routes, or `null` for an unrelated route. `now` is an ISO timestamp and `readJSON` is a zero-argument closure bound to the current request.

The existing Worker remains responsible for same-origin/allowed-origin rules, JSON body bounds, public-submission rate limits, signed organiser authentication, security headers and private cache rules. The map module also rejects private routes without a verified actor, as defence in depth. It must not be exposed as an unprotected standalone HTTP service.

The existing production organiser access remains closed until its real identity configuration is completed and verified. Adding this module does not open it. Local development uses the existing loopback-only temporary session token; it is not a public production sign-in method.

## Ownership, permission and source conditions

The place records live in the organisation's register rather than in a proprietary map provider's place database. Their JSON/GeoJSON and SQLite data can be moved to suitable locally operated servers. That control does not turn third-party data into the organisation's intellectual property.

Public display permission is recorded separately from reuse licensing. This build does not declare all contributions CC0 or grant a blanket open-data licence. Public exports preserve source details and say that wider reuse terms have not yet been selected. Existing source restrictions, cultural authority and third-party map/imagery conditions continue to apply. Base-map tiles and the community's contributed place records remain distinct layers.

## Deliberate extension points

- Stable place IDs and versioned source records can connect future asset identifiers, equipment registers and noticeboard publishers.
- A later geometry layer can add lines, areas and relationships while preserving point IDs and existing revisions.
- Surveying, scans, images and digital twins can refer to a place/version through separately governed attachments and provenance. They are not implemented by this schema.
- Observation time and source fields provide a starting point for human checking, confidence and condition history. Unknown values remain unknown.
- A supporting team can later receive explicit stewardship roles and a documented handover. Local decisions and data permissions remain with the appropriate people.

## Verification

Run `node --test tests/map-records.test.mjs tests/map-worker.test.mjs` with Node.js 24 or newer. The tests use the production migration and native SQLite adapter, exercising persistence, private pending records, publication, canonical retries, stale correction conflicts, revision preservation, archiving, source handling, public/private exports and input validation. Worker integration tests cover routing, origin/rate-limit controls, authenticated map review and map-only geolocation permission.

`node scripts/verify-portability.mjs` performs a separate real local D1-to-SQLite rehearsal. It applies all migrations to an isolated local Cloudflare store; records a fictional participant, one published fictional map point and a pending correction; exports through Wrangler's SQL exporter; and restores the SQL into native SQLite. The same Worker must then produce exactly matching participant and private map exports and identical public GeoJSON. The check also verifies that map permission, source revisions and audit triggers still prevent history rewrites after restore. The rehearsal never authenticates to a Cloudflare account, reads a live register or uses real participant/place data. It needs local loopback networking for Cloudflare's local runtime.

The extended rehearsal passed on 19 November 2026 with migrations 0001, 0002 and 0003. This verifies the exercised local Cloudflare D1 SQL export and native SQLite restore, including map history. A future live-account backup and production server cutover require their own rehearsal.
