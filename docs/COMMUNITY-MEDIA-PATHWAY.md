# Community photos and panoramas pathway

Luke's direction, 20 November 2026. Establish the pathway now; implement the community media service in a later agreed task.

The community collection will hold normal photographs, panoramas and 360 photographs, connected to places on the local map. It needs its own database and approval before permanent storage. Verified membership and media contributor roles should make that process easier. The existing map remains the place register; media has its own identity, permissions and history.

## Build from the existing 360 photo maps

Luke has already photographed and demonstrated two locations. Use these working examples as the starting point for the viewer, photo manifests and place relationships:

| Example | Public viewer | Local sources |
| --- | --- | --- |
| Dunwich / Gumpi ferry terminal | [360 evidence map](https://auraofintelligence.github.io/dunwich-gumpi-ferry-terminal-open-data-lab/evidence-map.html) | `G:\GithubLocal-PC\dunwich-gumpi-ferry-terminal-open-data-lab\evidence-map.html`, `assets\photo-data.js`, `docs\photo-manifest.json`, `assets\script.js`, `assets\panos\`, `tools\generate_photo_assets.py` |
| Ballow Road Sand & Screen Hub | [360 ideas map](https://auraofintelligence.github.io/ballow-road-sand-screen-hub/evidence-map.html) | `G:\GithubLocal-PC\ballow-road-sand-screen-hub\evidence-map.html`, `assets\js\site-360-data.js`, `assets\js\evidence-map.js`, `assets\site-360\`, `assets\site-360-viewer\`, `assets\vendor\pannellum\` |

The source records already connect source filenames, public derivatives, thumbnails, capture labels, location and viewing assets. The Gumpi manifest includes 2:1 panoramas at 5760 × 2880 and explicitly identifies rounded photo EXIF positions rather than survey coordinates. Some photos have no GPS. Preserve that distinction rather than manufacturing a position or treating a camera timestamp as independently verified.

The Sand & Screen viewer supports looking around a selected 360 point, selecting thumbnails and downloading the panorama. Both projects use Pannellum. Reuse those useful viewer and manifest patterns after reading their licences and source instructions. Keep Luke's original credits, source identities and the connection to the two places. Preserve original files separately from resized viewing copies.

## Separate records and file storage

Use a dedicated community-media database for metadata, consent, review, retention approval and links. Store image bytes separately in private object storage, initially Cloudflare R2. Cloudflare D1 provides a SQLite-compatible metadata option; portable SQL records and object manifests should also support a later island-hosted service. See [D1](https://developers.cloudflare.com/d1/) and [R2](https://developers.cloudflare.com/r2/).

Give the service separate bindings, access roles and retention rules. It should not share the cooperative intake register or silently inherit political membership permissions. Do not store image files or identity documents in the place database, public repository or public upload form.

Proposed record groups:

- **Media items:** stable ID, media kind, title, contributor reference, place ID and optional place version, capture time and its source, location and precision, projection/orientation, dimensions, MIME type and byte hash.
- **Files and versions:** original object key, thumbnail and viewing derivatives, content hash, generation method, version, storage state and provenance.
- **Permissions:** rights holder, credit preference, permitted uses, public location choice, consent history and any relevant cultural authority or image permissions.
- **Reviews and retention:** reviewer, decision, reason, approved storage scope, permanent-storage approval and date, publication approval and date, correction or withdrawal history.
- **Verification and roles:** private membership/verification references, media-role scope, who granted it, effective dates and review/revocation history. Public media records need only the approved public credit.

The place record can show approved media through its stable place ID. A media item may also exist without a mapped position. Later photos, scans or observations can refer to the same place and its history without becoming duplicate place databases.

## Approval before permanent storage

The workflow should distinguish these decisions:

1. Prepare a draft on the contributor's device and choose what to send.
2. Put an upload in private, temporary staging with a visible expiry governed by the agreed retention policy.
3. Review file integrity, source, rights, place association, public-location choice and intended use.
4. Record an explicit decision permitting permanent community storage. Permanent retention is not implied by uploading, being a member or receiving a map pin.
5. Approve which derivatives and metadata may be published. Storage approval and public publication are separate choices.
6. Keep corrections, new versions, changed permissions and withdrawals traceable. Apply the agreed expiry/removal process to unapproved staged files and explain how backups or already shared copies are handled.

No staging period is fixed by this brief. Choose and publish that policy before accepting real uploads. Permanent files and public derivatives should be separate from temporary staging so an expiry rule cannot remove approved material accidentally or preserve declined files indefinitely.

## Verified membership and media roles

KYC-backed member status can establish who is making a contribution and help an authorised reviewer use an easier, faster workflow. Keep the identity verification private and refer to its result rather than copying identification documents into media records.

Develop member-chosen media roles such as contributor, trusted contributor and media steward, with specific permissions. A trusted role can reduce repeated checks and support a delegated approval workflow where the community has agreed it. Each permanent-storage decision still needs an attributable approval under that policy; a badge or numerical rank alone is not an approval record.

Verification does not grant another person's copyright, permission to publish private locations, or authority over cultural knowledge. Custodial approval and permitted use remain separate. Membership, employment, public credit and media stewardship also remain distinct decisions.

## Connect the viewer without making contribution difficult

Keep the visitor path familiar: open a place, choose a photo or 360 view, look around, and return to the map. Thumbnails should identify the location and capture date when known. Offer larger text, clear controls, keyboard navigation, captions and a normal-photo alternative where useful. A phone should load a suitable viewing derivative rather than every full-resolution original.

For contributors, place selection should carry the place ID into the media form. Explain temporary staging, permanent storage and public publication in ordinary language. Show a confirmed receipt only after a durable save, and make review status and corrections understandable. The future verified-member workflow should reduce repeated effort without silently expanding sharing.

## Work to prepare the later implementation

Begin with Luke's two existing collections and confirm the files, source identities, rights and selected place links. Define the media schema and role/retention policy, then provision the separate database and object stores. Adapt the demonstrated 360 viewer to read the approved public media catalogue. Test upload retries, expiry, approval, private originals, published derivatives, corrections, role revocation and an export/restore before inviting community uploads.

This task creates the pathway and records the working references. It does not provision a media database, upload photographs, collect KYC documents or change the two source sites.
