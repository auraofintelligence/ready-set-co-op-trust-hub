# Learning and work records

ReadySETCO is a proposed cooperative. Strange But True is the initial operator. Point Lookout Fishing Club (PLFC) is an existing club. Luke Hayes is its Secretary. Sandy Sports is a project Luke is developing towards club formation. The learning example is for PLFC, with its own approval and learner group required before assignment.

## Working in the portal

- **Learning & work** is available in the participant view. A person can save paid work, working holiday work, community volunteering, training, employer participation and grant-writing interests separately. The profile also records availability, self-described workplace English, skills and licence types.
- **Evidence reviews** takes a credential name and optional issuer with explicit consent to internal review. Reviewers record the method, decision, expiry where applicable, and a member-visible note. Members can withdraw a request or ask for another review after more information is requested. An expiry or withdrawal is reflected on the private profile.
- **Webmaster → Learning and evidence desk** gives the native Webmaster a review queue and separate preview of the two PLFC drafts. This is a ReadySETCO operator responsibility. Club committee access by itself leaves those records private. Self-review is blocked.
- **Your courses**, inside **Learning & work**, lists courses published to the learner's groups. Members can enrol, resume lessons and submit a practical using fictional examples. Assessors can pass a practical or give feedback and request changes. A pass posts a version-linked completion on the member's profile.
- **Course builder** lets the native Webmaster and the committee for a training group create, edit, reorder and preview lessons, publish a version and assess practicals from that group. Current learners can keep working in the release they started after a new version is published. The personal export includes the learner's enrolments, progress, practicals and completions alongside evidence reviews.

## Starting PLFC training

1. Sign in and open **Course builder**. Select **Point Lookout Fishing Club training**.
2. Choose **Edit or preview draft**. The officer course covers preparing a changeover, running a first meeting rehearsal, handing over access and equipment, and checking in after the first week. The volunteer induction covers agreeing on a shift, briefing and safeguards, and handing over at the end of the shift. Each course ends with a written practical and assessment criteria.
3. After the club clears the material for use, select **Publish course**, then **Publish to this group**. The group is private and has no public applications.
4. Give the intended learner **Participant** access to the PLFC training group under **Webmaster → Manage account → Group responsibilities**. Assign **Committee** access to trusted course authors or assessors. People can then open the course from **Learning & work**. Another authorised assessor must review a course assessor's own practical.

## Other pathways

- Straddie Noticeboard Network training can use its [publishing guide and practice board](https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/). Proposed modules include drafting, issuer approval, consent, approved outlets, review, correction and withdrawal.
- [Minjerribah Screen & Media Network](https://auraofintelligence.github.io/minjerribah-screen-media-network/) supplies the setting for production, media permissions, captioning, event crew work and community screening. Its local source is `G:\GithubLocal-PC\minjerribah-screen-media-network`.
- Local employer onboarding will cover forming ReadySETCO and joining after formation, the club and business relationship, work opportunities, recruitment responsibilities and participation agreements. A training record and any future legal admission record serve different purposes.
- Working holiday preparation, volunteer organisation inductions, grant writing, events, and Cultural Intelligence Node digital stewardship have course categories ready. Sandy Sports course content can follow when its own formation and training needs are defined.

## Screening and future employer referrals

Profile preferences, verified evidence and an employer referral have different purposes. Evidence review is private. A future referral workflow needs an identified employer and role, the member's affirmative permission for that introduction, selected contact and screening fields, and an audit event. Introductions should show the method, date and validity of checks that matter to the role. Give the employer only the agreed information and preserve the employer's own hiring and checking responsibilities.

Use Visa Entitlement Verification Online (VEVO) with the person's permission where applicable. This service records an authorised reviewer's finding and expiry date. A working-holiday visa check does not establish whether a role counts as specified work. That depends on the relevant subclass, work type, location and current [subclass 417](https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/specified-work-417) or [subclass 462 rules](https://immi.homeaffairs.gov.au/what-we-do/whm-program/specified-work-conditions/specified-work-462). Community volunteering is a separately offered pathway. Where an arrangement involves unpaid work, follow the [Fair Work Ombudsman's guidance](https://www.fairwork.gov.au/starting-employment/unpaid-work).

Reviewers can record observed workplace communication and practical skills against the duties of the role. Use the profile's self-described English separately from a review outcome. Look up verification sources when applicable. Document copies, passport and licence numbers belong outside this profile. Confirm the collection notice and retention schedule before operational intake, including audit record retention and expiry handling. [Home Affairs VEVO for organisations](https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online/for-organisations) · [OAIC Australian Privacy Principles](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines)

## Implementation

Migration `0009_learning_profiles.sql` seeds categories and draft records. Migration `0010_learning_courses.sql` creates the private tutor and learner workflow, adds the PLFC training group and gives both drafts lesson and assessment content. The migrations create no accounts or grant anyone group membership. ReadySETCO's existing authenticated Worker routes `/api/learning/*`, and the signed-in portal uses the same-origin session. Draft writes require a current edit version. Evidence and practical requests are retry-safe. Evidence decisions and practical passes record their outcomes atomically. Released course content is protected against in-place edits.

Run `npm run check` and `npm test` from the checkout. The production release path applies the migration before deploying the Worker; use the existing [Cloudflare release procedure](AUTOMATIC-DEPLOYMENT.md). Before admitting real evidence, verify the member, unrelated account and native Webmaster views against a controlled deployment and confirm operational data handling with the operator.
