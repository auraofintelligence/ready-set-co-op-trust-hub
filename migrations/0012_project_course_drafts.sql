-- Draft catalogue. The four new training groups are private and closed to public applications.
-- Additive seed. Existing PLFC courses, access assignments and releases are left intact.

INSERT INTO learning_categories (id,name,position) VALUES
  ('site-tours','Site tours & first steps',5),
  ('member-start','Member & contributor welcomes',15),
  ('digital-skills','Digital & AI skills',100)
ON CONFLICT (id) DO NOTHING;

UPDATE learning_categories SET name='Office-holder handovers' WHERE id='committee';
UPDATE learning_categories SET name='Volunteer inductions' WHERE id='volunteers';
UPDATE learning_categories SET name='Screen & media skills' WHERE id='community-media';
UPDATE learning_categories SET name='Noticeboard publishing & hosting' WHERE id='noticeboard';
UPDATE learning_categories SET name='Paid work & working holidays' WHERE id='working-holiday';
UPDATE learning_categories SET name='Local employers & co-op participation' WHERE id='employers';
UPDATE learning_categories SET name='Grants & project delivery' WHERE id='grants';
UPDATE learning_categories SET name='Events & crew skills' WHERE id='events';
UPDATE learning_categories SET name='Place records & digital stewardship' WHERE id='digital-stewardship';

INSERT INTO member_sites (id,name,locality,summary,published,applications_open,created_at,updated_at,created_by,write_id) VALUES
  ('sandy-sports-training','Sandy Sports training','Minjerribah','Private preparation for the proposed Sandy Sports club and its activities.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration:0012','migration:0012'),
  ('noticeboard-training','Straddie Noticeboard Network training','Minjerribah','Private practice for local notice authors, reviewers, venue teams and volunteers.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration:0012','migration:0012'),
  ('msmn-training','Minjerribah Screen & Media Network training','Minjerribah','Private drafts for the proposed media and screening programme.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration:0012','migration:0012'),
  ('ready-setco-training','Ready SETCO Skills & Work','Minjerribah','Private practice drafts for local employment, employer participation, community skills and grants.',0,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'migration:0012','migration:0012')
ON CONFLICT (id) DO NOTHING;

-- Point Lookout Fishing Club
INSERT INTO learning_courses (id,category_id,site_id,provider_name) VALUES
  ('plfc-site-tour','site-tours','plfc-training','Point Lookout Fishing Club'),
  ('plfc-president','committee','plfc-training','Point Lookout Fishing Club'),
  ('plfc-vice-president','committee','plfc-training','Point Lookout Fishing Club'),
  ('plfc-secretary','committee','plfc-training','Point Lookout Fishing Club'),
  ('plfc-assistant-secretary','committee','plfc-training','Point Lookout Fishing Club'),
  ('plfc-treasurer','committee','plfc-training','Point Lookout Fishing Club'),
  ('plfc-webmaster','committee','plfc-training','Point Lookout Fishing Club'),
  ('plfc-adult-member','member-start','plfc-training','Point Lookout Fishing Club'),
  ('plfc-cadet-member','member-start','plfc-training','Point Lookout Fishing Club'),
  ('plfc-junior-member','member-start','plfc-training','Point Lookout Fishing Club'),
  ('plfc-social-member','member-start','plfc-training','Point Lookout Fishing Club'),
  ('plfc-casual-member','member-start','plfc-training','Point Lookout Fishing Club'),
  ('plfc-lifetime-member','member-start','plfc-training','Point Lookout Fishing Club')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learning_course_versions (course_id,revision,state,title,description,lessons_json,practical) VALUES
  ('plfc-site-tour',1,'draft','Find your way around the PLFC clubhouse',
   'A quick tour for anyone curious about the fishing club, its website or their first local meet.',
   json_array(
     json('{"title":"Start with the public clubhouse","body":"Find the fishing guide, conditions, club calendar and public events. Open the demo and choose Guide me if you want help getting around. Confirm the details of an event with the organiser before travelling.","captureNotes":"Record the demo homepage, calendar and fishing guide using public or fictional examples. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Find the right door","body":"Use the join information to compare membership options. Members use their own sign-in for the areas they are allowed to see. If you are unsure which area to use, ask the club through its published contact route.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Where should a visitor look for a local meet?","choices":[{"id":"correct","text":"The public club calendar and event details"},{"id":"alternative","text":"The committee meeting register"}],"correct_choice_id":"correct","explanation":"Visitors can start from public information and confirm arrangements with the event lead.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Pick a fictional local meet. Write a three-line welcome that tells a visitor where to find the date, what to confirm and how to ask for help.'),
  ('plfc-president',1,'draft','PLFC President handover',
   'Prepare a meeting, chair a decision and carry the result into the next club update.',
   json_array(
     json('{"title":"Prepare with the Secretary","body":"Open the next agenda together. Identify items for information, discussion and decision. Check what the rules and committee require for attendance, conflicts of interest and the wording of motions.","captureNotes":"Use the demo Meeting desk and a fictional motion. Show where agenda papers and draft minutes are found. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Close the loop","body":"Ask the Secretary to read back the wording of the decision. Give each action an owner and due date. Review the newsletter preview and check that the President’s message reflects what the club has agreed to share.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A motion changed during discussion. What belongs in the minutes?","choices":[{"id":"alternative","text":"The first draft wording copied from the agenda"},{"id":"correct","text":"The final wording and actual outcome"}],"correct_choice_id":"correct","explanation":"The record needs to reflect the decision actually made.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a chair’s handover for a fictional meeting. Include the agenda item that needs a decision, a way to handle a disclosed interest, the action owner and the public message still awaiting review.'),
  ('plfc-vice-president',1,'draft','PLFC Vice President handover',
   'Back up the chair and keep the next local meet moving.',
   json_array(
     json('{"title":"Agree where you are covering","body":"Check the agenda with the President and agree which items you will chair or follow up. Record what you have authority to decide and which matters you should bring back.","captureNotes":"Show the demo agenda and public event calendar together. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Check the next local meet","body":"Confirm the date, meeting point, welcome lead and equipment lead. Check with the responsible officer before promising a date to another club. Send a short update to the newsletter and check its contribution status.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should go in your handover about the next meet?","choices":[{"id":"correct","text":"Confirmed arrangements and named owners for outstanding work"},{"id":"alternative","text":"The draft event title by itself"}],"correct_choice_id":"correct","explanation":"The next officer needs to know what is settled and who can resolve the gaps.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a one-page handover for a fictional meet with one unconfirmed date, one equipment job and a newsletter update in review.'),
  ('plfc-secretary',1,'draft','PLFC Secretary handover',
   'Find the live meeting and newsletter work, record decisions and hand over the club’s calendar.',
   json_array(
     json('{"title":"Prepare and file the committee record","body":"Check the next meeting date, agenda and carried actions. Record the actual wording and result of motions. Keep the committee record and working notes in the private desk and use the approved release process for member minutes.","captureNotes":"Show the demo meeting desk and a fictional member edition. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Coordinate member correspondence","body":"Check the current newsletter edition and who is publishing it. Confirm any returning membership offer with the club register and the Treasurer’s waiver decision where relevant. Pass the private invitation to its intended recipient.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Who should receive a returning member’s private link?","choices":[{"id":"alternative","text":"Everyone on the newsletter list"},{"id":"correct","text":"The intended member after the relevant checks"}],"correct_choice_id":"correct","explanation":"The private link is for the named recipient.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft a handover note with the next meeting, an unfinished action, the status of a fictional newsletter edition and a pending member correspondence item.'),
  ('plfc-assistant-secretary',1,'draft','PLFC Assistant Secretary handover',
   'Share the meeting follow-up and newsletter workload with the Secretary.',
   json_array(
     json('{"title":"Share a desk without duplicating work","body":"Agree who follows up each open meeting action and who will assemble, review and publish the next newsletter. Check the current version before editing. Use the contribution history to see what is still due.","captureNotes":"Capture the demo newsletter and officer task history with synthetic names. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Bring paper and replies back into the record","body":"File returned task sheets under the matching officer and clarify unclear ticks or updates with the person who wrote them. Agree who will respond to any membership reply or prepare a member notice.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Two officers are working on the same newsletter. What do you agree first?","choices":[{"id":"correct","text":"Who will own each edit, review and release step"},{"id":"alternative","text":"That each officer should publish an edition"}],"correct_choice_id":"correct","explanation":"Clear ownership prevents duplicate notices and conflicting versions.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a fictional weekly handover listing the draft newsletter, replies still due, three owners and the next check-in with the Secretary.'),
  ('plfc-treasurer',1,'draft','PLFC Treasurer handover',
   'Review membership payments, stock and the next report with the incoming Treasurer.',
   json_array(
     json('{"title":"Reconcile the payment trail","body":"Match each fictional membership payment or shop receipt to the corresponding register entry. Identify missing evidence. Record approved waivers separately from money received and confirm which reports are ready for committee review.","captureNotes":"Use demo entries in the Stock and reports desks. Leave real balances and invoices out of the recording. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Pass on stock and reporting","body":"Show how delivery costs, missing invoices and counts are tracked. Compare the last stocktake with a physical count. Provide a report date and list the items awaiting evidence or committee approval. Use individual accounts and agreed access when transferring responsibilities.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"How should an approved fee waiver appear?","choices":[{"id":"alternative","text":"As income that has arrived in the bank"},{"id":"correct","text":"As a waiver separate from cash received"}],"correct_choice_id":"correct","explanation":"A waiver and a receipt are different records.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Use made-up amounts to reconcile two receipts and one approved waiver. Flag a missing stock invoice and draft the questions for the next Treasurer.'),
  ('plfc-webmaster',1,'draft','PLFC Webmaster handover',
   'Hand over clubhouse access and support using the demo or a sanctioned test account.',
   json_array(
     json('{"title":"Match access to a club decision","body":"Confirm the approved role and who authorised it. Use a named account and the intended invitation. Have the recipient check the areas their role needs and escalate an access problem through the club support route.","captureNotes":"Record the public demo and a supervised test view. Keep real activation links, credentials and member records out. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Give the next webmaster a support list","body":"Document the owner of the club account, current support requests, outstanding access changes and recovery contacts through the club’s approved records. Review access when an officer changes role.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What do you pass to the incoming webmaster?","choices":[{"id":"correct","text":"An authorised access checklist and support history"},{"id":"alternative","text":"Everyone’s saved passwords"}],"correct_choice_id":"correct","explanation":"The incoming administrator needs their own account and a clear source of authority.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional support handover covering one incoming officer, one outgoing officer and a member who needs a private follow-up.'),
  ('plfc-adult-member',1,'draft','PLFC Adult member welcome',
   'Get around the member clubhouse and plan your first meet or fishing activity.',
   json_array(
     json('{"title":"Open your member area","body":"Find the member calendar, approved member updates and your own account details. Ask the club about activation and paid membership if an expected area is unavailable.","captureNotes":"Show the public clubhouse and an authorised adult demo account. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Plan a first outing","body":"Check the event details and ask what to bring and who will meet you. Keep private catch locations, personal details and pictures within the audience you mean to share them with.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"An expected member page is unavailable. What do you do?","choices":[{"id":"alternative","text":"Use another member’s account"},{"id":"correct","text":"Ask the club to check your membership and access"}],"correct_choice_id":"correct","explanation":"Each member has their own access and club records.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Make a first-meet checklist with where to look, two questions for the event lead and a sharing choice for a fictional catch entry.'),
  ('plfc-cadet-member',1,'draft','PLFC Cadet member and guardian welcome',
   'Help a cadet and their guardian plan a supported first club session.',
   json_array(
     json('{"title":"Plan the first visit together","body":"Choose a suitable club activity with the guardian. Ask who will lead, how the young person checks in and which equipment they should bring. The guardian deals with the application and current permissions.","captureNotes":"Use a fictional family and the public membership information. Keep details of real young people private. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Ask before sharing","body":"Check with the designated lead about supervision and photo arrangements. Ask the guardian separately about online participation and check the club’s review before using those features.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Who should help a cadet agree first-visit arrangements?","choices":[{"id":"correct","text":"Their guardian and the club’s activity lead"},{"id":"alternative","text":"Anyone posting on an open discussion board"}],"correct_choice_id":"correct","explanation":"Guardians and the responsible club lead can make sure the arrangements are appropriate.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a short first-session welcome for a fictional cadet and guardian with the meeting point, their contact person and two permission questions.'),
  ('plfc-junior-member',1,'draft','PLFC Junior member and guardian welcome',
   'Find an appropriate junior activity and understand the clubhouse sharing choices.',
   json_array(
     json('{"title":"Choose an activity with your guardian","body":"Ask about the activity, skill level, supervision and equipment before coming along. Confirm the meeting point and what to do if you or the guardian need help.","captureNotes":"Show the public youth application choice and fictional event details. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Use the online area with approved access","body":"Speak up if you are unsure about an online message, photo or activity. A guardian and the club review online participation separately. Ask the lead how to report a concern.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What do you do before posting a photo from a junior session?","choices":[{"id":"alternative","text":"Upload it as soon as the event finishes"},{"id":"correct","text":"Check the agreed permissions with the guardian and club lead"}],"correct_choice_id":"correct","explanation":"Sharing needs its own permission and review.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write three questions a junior and their guardian can ask before an event, including how to get help and what may be shared.'),
  ('plfc-social-member',1,'draft','PLFC Social member welcome',
   'Find club gatherings, member notices and ways to help out socially.',
   json_array(
     json('{"title":"Find a gathering","body":"Use public events and member updates to find a gathering. Confirm what is open to your category with the club contact.","captureNotes":"Show a fictional social meet in the public demo calendar. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Put your hand up for a task","body":"If you offer to help with a meal or fundraiser, confirm the shift with the organiser. Ask which announcements or photos can be shared.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Where do you check a social event’s eligibility or guest arrangements?","choices":[{"id":"correct","text":"The event information and the club contact"},{"id":"alternative","text":"An older screenshot in a group chat"}],"correct_choice_id":"correct","explanation":"The organiser can confirm the current arrangements.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a one-paragraph plan for a fictional club gathering with a guest, a volunteer option and a check-in contact.'),
  ('plfc-casual-member',1,'draft','PLFC Casual member welcome',
   'Check the conditions for a visit or one-off activity before making plans.',
   json_array(
     json('{"title":"Confirm what the category covers","body":"Find the club’s current public join information. Ask which activity your casual membership covers and whether there are fees, capacity limits or advance arrangements.","captureNotes":"Capture the public join options with no application entered. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Check in for the day","body":"Bring the public event details and confirm your meeting point and contact. Ask how to find updates if the plans change and report anything the next crew should know.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What is the best way to confirm a casual place?","choices":[{"id":"alternative","text":"Assume that any listing confirms a place"},{"id":"correct","text":"Check the current event and ask the organiser"}],"correct_choice_id":"correct","explanation":"The organiser can confirm availability and any conditions.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a short enquiry for a fictional activity asking about a place, preparation and where to get a change notice.'),
  ('plfc-lifetime-member',1,'draft','PLFC Lifetime member welcome',
   'Find the current clubhouse, check your existing record and choose how to contribute.',
   json_array(
     json('{"title":"Update your connection with the club","body":"Use the club contact to confirm the current lifetime membership record and sign-in. Ask how to update your preferences and where to find member notices.","captureNotes":"Show the demo sign-in and a fictional member contact update. Reference site: https://plfc-clubhouse.auraofintelligence.workers.dev/"}'),
     json('{"title":"Share knowledge by agreement","body":"Offer a story, guide or mentoring time to the club. Check before sharing another member’s names, records, old photos or private catch locations.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"You have a historical photo of club members. What should happen before publishing?","choices":[{"id":"correct","text":"Check permission, audience and credits with the club"},{"id":"alternative","text":"Treat the age of the photo as permission"}],"correct_choice_id":"correct","explanation":"The subjects, source and intended audience still matter.","source_refs":["https://plfc-clubhouse.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft an offer of one fictional archive item or mentoring session, with a named club contact and the permission check still required.')
ON CONFLICT (course_id,revision) DO NOTHING;

-- Sandy Sports
INSERT INTO learning_courses (id,category_id,site_id,provider_name) VALUES
  ('sandy-site-tour','site-tours','sandy-sports-training','Sandy Sports'),
  ('sandy-president','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-vice-president','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-secretary','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-assistant-secretary','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-treasurer','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-webmaster','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-sport-lead','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-film-lead','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-facilities-lead','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-resident-member','member-start','sandy-sports-training','Sandy Sports'),
  ('sandy-non-resident-member','member-start','sandy-sports-training','Sandy Sports'),
  ('sandy-junior-member','member-start','sandy-sports-training','Sandy Sports'),
  ('sandy-supporter','member-start','sandy-sports-training','Sandy Sports'),
  ('sandy-film-participant','member-start','sandy-sports-training','Sandy Sports'),
  ('sandy-volunteer','volunteers','sandy-sports-training','Sandy Sports'),
  ('sandy-committee-member','committee','sandy-sports-training','Sandy Sports'),
  ('sandy-founding-member','member-start','sandy-sports-training','Sandy Sports')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learning_course_versions (course_id,revision,state,title,description,lessons_json,practical) VALUES
  ('sandy-site-tour',1,'draft','Explore the Sandy Sports proposal',
   'Find the proposed sport, film, places and training pages and choose what to help shape.',
   json_array(
     json('{"title":"Tour the proposed programme","body":"Start with the programme and places pages. Compare sports, outdoor film and possible facilities. Mark which items are proposals, examples or open for a conversation.","captureNotes":"Capture the public programme and places pages. Use visual labels for proposed and confirmed information. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Choose a way to help","body":"Use the interest page to offer a sport, skill, venue conversation or help with formation. Ask what is being planned and who needs to agree before promising a date or place.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"You see a possible site listed. What does that tell you?","choices":[{"id":"correct","text":"It is a site to investigate with the responsible people"},{"id":"alternative","text":"It is booked for an opening event"}],"correct_choice_id":"correct","explanation":"The places page is a proposal and research tool.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Make a route card for a fictional newcomer. Include one sport, one film option, one status check and where to offer help.'),
  ('sandy-president',1,'draft','Sandy Sports President preparation',
   'Rehearse chairing a formation meeting and create a first handover for a proposed President.',
   json_array(
     json('{"title":"Prepare decisions for the founding group","body":"Draft an agenda about purpose, activities and first priorities. Write which decisions are within the founding group’s authority and who else needs to agree, especially about use of places and public commitments.","captureNotes":"Use the demo governance desk to rehearse an inaugural agenda. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Chair and hand over","body":"Practise checking interests, asking for input, reading back outcomes and assigning actions. Leave the successor a dated list of open decisions, proposed expenses and people to contact.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A possible venue is mentioned in the meeting. What can you publish?","choices":[{"id":"alternative","text":"That approval has already been given"},{"id":"correct","text":"Its current proposal status and any approved wording"}],"correct_choice_id":"correct","explanation":"Meeting discussion and venue approval have separate evidence.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft an inaugural meeting agenda, one example decision, a note on venue authority and three actions for a successor.'),
  ('sandy-vice-president',1,'draft','Sandy Sports Vice President preparation',
   'Set up a backup for the chair and coordinate work across proposed activities.',
   json_array(
     json('{"title":"Agree a practical backup plan","body":"Discuss with the proposed chair when you would lead and which decisions need group confirmation. Set a way for sport, film and facilities leads to raise a clash or missing resource.","captureNotes":"Record a fictional handover in the demo committee workspace. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Make an activity walkthrough","body":"Select one proposed activity. Check the event lead, potential site, readiness, costs and decision still needed. Report the next action and who can do it.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A sport and a film proposal need the same place. What comes first?","choices":[{"id":"correct","text":"Confirm the constraints and take a clear choice to the responsible group"},{"id":"alternative","text":"Announce both dates as if they are booked"}],"correct_choice_id":"correct","explanation":"The group needs a concrete decision with the constraints visible.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional cover plan for a meeting and one venue clash, with a suggested action owner and decision date.'),
  ('sandy-secretary',1,'draft','Sandy Sports Secretary preparation',
   'Start a formation record, organise drafts and leave clear actions for the next meeting.',
   json_array(
     json('{"title":"Build the first record","body":"Bring the draft rules, meeting notice, agenda and current proposals together. Label drafts and keep author, date and version. Record the actual decision and current status of each matter.","captureNotes":"Open the constitution and governance demo with a fictional rules edit. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Keep the follow-up clear","body":"List the owner, deadline and reference for each action. Prepare accurate wording for people who asked about joining or helping. Keep expressions of interest and private contact details in the appropriate records.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What belongs with an agreed action?","choices":[{"id":"alternative","text":"A task with no owner or source"},{"id":"correct","text":"Owner, date and a link or reference to the decision"}],"correct_choice_id":"correct","explanation":"The next Secretary needs to verify what was agreed.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare fictional meeting notes with a draft rule, one agreed action and one deferred decision. Add a handover for the next date.'),
  ('sandy-assistant-secretary',1,'draft','Sandy Sports Assistant Secretary preparation',
   'Back up the formation record and organise follow-up where this role is adopted.',
   json_array(
     json('{"title":"Divide the shared workload","body":"Agree who prepares the agenda, collects reports, checks updates and sends a reviewed reply. Record what you can do independently and when the proposed Secretary needs to confirm.","captureNotes":"Use a fictional shared task list in the demo committee room. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Prepare a clean handover","body":"Reconcile the paper notes and draft files before the next meeting. Send the Secretary a short list of incomplete replies and records awaiting review. Keep personal details out of the browser demo.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Where should real contact details be entered while using a public demo?","choices":[{"id":"correct","text":"Only in an appropriate private process authorised by the project"},{"id":"alternative","text":"In the public browser demo so they are easy to find"}],"correct_choice_id":"correct","explanation":"The demo is for fictional planning and rehearsals.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Make a fictional shared checklist for a meeting and a volunteer invitation. Set an owner and handover point for each.'),
  ('sandy-treasurer',1,'draft','Sandy Sports Treasurer preparation',
   'Build a starting budget and a handover for grant, donation and equipment discussions.',
   json_array(
     json('{"title":"Price one proposal","body":"Create a simple activity budget with quantities, evidence, income assumptions and dates. Label contributions and grants by their actual status. Include the costs of delivery and looking after equipment.","captureNotes":"Show the public funding model with a fictional set of amounts. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Track approvals and receipts","body":"Record who could approve a purchase, the actual applicant or operator, where receipts go and when the budget will be reviewed. Keep real payments in the authorised system and figures in the demo fictional.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"How should a grant application awaiting a result appear?","choices":[{"id":"alternative","text":"As money already available"},{"id":"correct","text":"As a possible income source with its status"}],"correct_choice_id":"correct","explanation":"The Treasurer needs to distinguish a proposal from available funds.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Make a fictional budget for a come-and-try session or screening and identify one estimate to confirm, one approval and the review date.'),
  ('sandy-webmaster',1,'draft','Sandy Sports Webmaster preparation',
   'Walk through planned website access, draft publication and the first officer handover.',
   json_array(
     json('{"title":"Rehearse the different views","body":"Use the demo to check what a visitor, a prospective member and a local officer would need to find. Document which access is proposed and which feature is ready to test.","captureNotes":"Record the public or view-only demo. Avoid real credentials or invitations. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Log changes and support","body":"Record each requested permission, its authorisation and the affected pages. Rehearse how to reply to a support request using made-up details. Ask the accountable person to confirm any publication.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What do you need before giving a person office-holder access?","choices":[{"id":"correct","text":"An authorised decision and the right account"},{"id":"alternative","text":"A request from a social comment"}],"correct_choice_id":"correct","explanation":"An individual access change needs an identified person, role and authority.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft a fictional access handover with one member view issue, one proposed officer invitation and one page change waiting for approval.'),
  ('sandy-sport-lead',1,'draft','Sandy Sports Sport lead preparation',
   'Design a proposed come-and-try session that a new lead could take over.',
   json_array(
     json('{"title":"Plan one session","body":"Pick one activity, such as beach volleyball or flag football. Draft who it is for, the space and gear it needs, the lead and backups, and how a beginner would join in.","captureNotes":"Show the proposed sport programme and one fictional run sheet. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Prepare to confirm the session","body":"Check who can agree to the site, equipment, supervision and event conditions. Record the point at which the lead would change or stop the plan. Carry decisions and unresolved matters into a handover.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should the next Sport lead know before sharing the event date?","choices":[{"id":"alternative","text":"The date by itself"},{"id":"correct","text":"Which arrangements are confirmed and which checks are open"}],"correct_choice_id":"correct","explanation":"Someone needs to own the checks that make the plan workable.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional 45-minute session plan with beginner instructions, a lead and backup, one site approval and a change-of-plan point.'),
  ('sandy-film-lead',1,'draft','Sandy Sports Film Club lead preparation',
   'Plan an outdoor cinema or film club trial with clear approvals and crew roles.',
   json_array(
     json('{"title":"Choose the format and people","body":"Set out the proposed screening or workshop, willing audience and responsibilities. Agree who would confirm venue access, screening permission or media releases before advertising.","captureNotes":"Use the Film Club and events desks with a fictional film and date. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Hand over the screening plan","body":"Draft the timeline for setup, sound and projection checks, audience welcome, pause or cancellation and pack-down. Tell the next lead which equipment and approvals still need confirmation.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What belongs in a draft screening handover?","choices":[{"id":"correct","text":"The status of permissions as well as crew and equipment"},{"id":"alternative","text":"A public date without a permissions check"}],"correct_choice_id":"correct","explanation":"The next lead needs to know what has been agreed.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Plan a fictional film night with a crew lead, venue contact, permissions checks, a weather call and a pack-down owner.'),
  ('sandy-facilities-lead',1,'draft','Sandy Sports Facilities lead preparation',
   'Compare possible places and hand over equipment, access and maintenance questions.',
   json_array(
     json('{"title":"Prepare a site visit","body":"Use the places and facilities pages to separate an idea from an agreed site. For a walk-through, note proposed access, amenities, storage, weather exposure and who can confirm arrangements.","captureNotes":"Capture the public space planner using a fictional layout. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Record the equipment and site dependencies","body":"List who would procure, store, check and maintain equipment. Write down costs, constraints and unanswered questions before presenting options. Pass the evidence and open actions to the next lead.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A useful space appears on a map. What is the next step?","choices":[{"id":"alternative","text":"Treat the map marker as access permission"},{"id":"correct","text":"Check the owner or operator and document the conditions for use"}],"correct_choice_id":"correct","explanation":"Maps support a site conversation and approval comes through the responsible party.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Compare two fictional places for a sports and film event. Record one accessibility check, storage choice and site conversation for each.'),
  ('sandy-resident-member',1,'draft','Sandy Sports Island resident welcome',
   'Explore the proposed local adult membership option and say what should be available locally.',
   json_array(
     json('{"title":"Find the local activities","body":"Compare planned activities in Dunwich, Amity Point and Point Lookout. Ask what is being proposed, who is organising it and how to hear about a confirmed trial.","captureNotes":"Show the public programme and activity information. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Shape what membership could mean","body":"Use the interest route to share one activity and one contribution you could make. Ask about proposed responsibilities and how the founding group will decide fees or participation.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What can an expression of interest do today?","choices":[{"id":"correct","text":"Share your interests and help shape a proposed club"},{"id":"alternative","text":"Guarantee a fee, vote or activity booking"}],"correct_choice_id":"correct","explanation":"Those arrangements need to be agreed as the club forms.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional resident’s interest note with an activity, a practical offer and a question for the founding discussion.'),
  ('sandy-non-resident-member',1,'draft','Sandy Sports Non-resident welcome',
   'Explore participation from off-island and check event access before making plans.',
   json_array(
     json('{"title":"Find a suitable activity","body":"Look for proposed sessions and the event contact. Ask about availability, timings and who would be able to take part. Check your own travel plans separately.","captureNotes":"Capture the public places and programme pages. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Offer a realistic commitment","body":"Share how often you could take part and what support or skills you can offer. Ask which membership and activity arrangements are being considered for people who live off-island.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should you confirm before travelling?","choices":[{"id":"alternative","text":"The date of an example event shown in a planning mock-up"},{"id":"correct","text":"Confirmed date, place, availability and the organiser’s contact"}],"correct_choice_id":"correct","explanation":"A mock-up cannot confirm the real event arrangements.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write an enquiry for a fictional off-island participant covering travel, availability and how they could help on the day.'),
  ('sandy-junior-member',1,'draft','Sandy Sports Junior and guardian welcome',
   'Help a young person and guardian ask the right questions about proposed sessions.',
   json_array(
     json('{"title":"Choose a session together","body":"Look for the proposed age group, activity and experience level. Ask the responsible contact how supervision, check-in and pickup would be organised before agreeing to take part.","captureNotes":"Use fictional family details and only public proposed session pages. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Check safeguarding and sharing","body":"Ask who handles safety and how to raise a concern. Discuss photo, video and online sharing separately so the guardian and young person understand the choice.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Who can explain the confirmed supervision arrangements?","choices":[{"id":"correct","text":"The responsible activity lead with the guardian involved"},{"id":"alternative","text":"Someone who shared a screenshot of the programme"}],"correct_choice_id":"correct","explanation":"The event lead can explain what will actually happen.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a first-session checklist for a fictional junior and guardian with contacts, handover, equipment and a sharing question.'),
  ('sandy-supporter',1,'draft','Sandy Sports Supporter welcome',
   'Offer skills, time, equipment or another contribution to the proposed club.',
   json_array(
     json('{"title":"Choose a practical offer","body":"Find one activity, facility or project you could support. Identify the item, time or skill and what conditions come with it. Discuss the right next step with the project contact.","captureNotes":"Show the public interest and equipment wishes pages. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Agree how it may be recognised","body":"Ask who would receive or hold a resource, how it would be returned and what may be said publicly. Record what is offered separately from what has been accepted.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What can appear in a public supporter acknowledgement?","choices":[{"id":"alternative","text":"An endorsement assumed from an enquiry"},{"id":"correct","text":"Only wording and attribution the supporter and project have agreed"}],"correct_choice_id":"correct","explanation":"An enquiry starts a conversation about the offer.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft a fictional loan or help offer with timing, conditions, the contact and one acknowledgement option.'),
  ('sandy-film-participant',1,'draft','Sandy Sports Film Club participant welcome',
   'Choose whether to watch, help at a screening or learn behind the scenes.',
   json_array(
     json('{"title":"Choose how you want to take part","body":"Explore the film club and proposed screenings. Ask whether a session is for an audience, a workshop crew or people learning a particular task.","captureNotes":"Show a public film club concept and fictional workshop listing. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Prepare for your first session","body":"Confirm the venue, timing, lead and what to bring. If you want to record or appear in footage, ask about notices, permissions and sharing before capturing or posting.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should you confirm before filming at a workshop?","choices":[{"id":"correct","text":"The lead’s arrangements and the relevant permissions"},{"id":"alternative","text":"Whether your phone has enough storage as the only check"}],"correct_choice_id":"correct","explanation":"Workshop participation and capture permission involve different choices.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a first-session plan for a fictional Film Club participant, with their role, arrival information and a question about filming.'),
  ('sandy-volunteer',1,'draft','Sandy Sports Volunteer welcome',
   'Practise checking in, working with a lead and handing over a proposed event shift.',
   json_array(
     json('{"title":"Ask about a real task","body":"Read the proposed role and say when you are available. Before treating a shift as agreed, confirm the lead, duties, meeting point, backup and equipment.","captureNotes":"Capture a fictional run sheet from an agreed demo or paper example. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Work within the briefing","body":"Ask who manages a weather or safety change. Check before taking over supervision, using gear or taking photos. Report concerns and hand back the equipment and unfinished actions.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"You are asked to cover a new task. What comes first?","choices":[{"id":"alternative","text":"Take it on and tell the lead after the event"},{"id":"correct","text":"Check with the responsible lead about scope and any training"}],"correct_choice_id":"correct","explanation":"The lead needs to check that the task and responsibility are understood.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional shift card for sport setup or cinema pack-down with a lead, handover time and stop decision.'),
  ('sandy-committee-member',1,'draft','Sandy Sports Committee member preparation',
   'Prepare for a possible committee role and take a first task through the draft, review and handover steps.',
   json_array(
     json('{"title":"Find the work you can help with","body":"Look at the proposed committee desks for governance, events, membership, funding and publishing. Agree a task with a lead, the decision it depends on and what needs a second person to review.","captureNotes":"Use the demo committee home and one fictional event task. Leave real account invitations and person records off-screen. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Work on a draft decision","body":"Record evidence, status, owner and due date. Raise relevant interests through the agreed process and pass a proposal to the people who can decide it. Tell the next officer which step still needs attention.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"When can a draft event date be shared as confirmed?","choices":[{"id":"alternative","text":"When it appears in a committee planning desk"},{"id":"correct","text":"After the person with authority has agreed the date and wording"}],"correct_choice_id":"correct","explanation":"Status and authority tell the next officer whether a plan can be acted on.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Take a fictional task from the committee desk. Write the next action, owner, one authority check, the status for any public message and the handover point.'),
  ('sandy-founding-member',1,'draft','Sandy Sports Founding participant welcome',
   'Follow the club''s formation, find your prospective member area and offer a practical contribution.',
   json_array(
     json('{"title":"Find your starting point","body":"Open Join and My Membership. Use the current instructions for expressing interest or using any joining option the operator has made available. The preview lets you see how the area works using fictional information.","captureNotes":"Show the public Join page and labelled My Membership preview. Use fictional names and no sign-up details. Reference site: https://sandy-sports-club.auraofintelligence.workers.dev/"}'),
     json('{"title":"Bring one founding idea","body":"Offer a skill, time or idea for sport, film or facilities. Ask how input on the club purpose, proposed rules and first activities is collected. Confirm what the operator has actually agreed before representing the club to others.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should a prospective founder look for before promising an activity on behalf of the club?","choices":[{"id":"correct","text":"A named decision-maker and a confirmed agreement"},{"id":"alternative","text":"A fictional entry in the member preview"}],"correct_choice_id":"correct","explanation":"A preview helps people understand the service while decisions need their own evidence.","source_refs":["https://sandy-sports-club.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft a one-paragraph founding contribution with a skill to offer, a question about proposed rules and the right person to follow up.')
ON CONFLICT (course_id,revision) DO NOTHING;

-- Straddie Noticeboard Network
INSERT INTO learning_courses (id,category_id,site_id,provider_name) VALUES
  ('noticeboard-site-tour','site-tours','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-community-contributor','member-start','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-business-publisher','member-start','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-editorial-review','noticeboard','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-feed-steward','noticeboard','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-venue-host','noticeboard','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-screen-caretaker','noticeboard','noticeboard-training','Straddie Noticeboard Network'),
  ('noticeboard-welcome-volunteer','volunteers','noticeboard-training','Straddie Noticeboard Network')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learning_course_versions (course_id,revision,state,title,description,lessons_json,practical) VALUES
  ('noticeboard-site-tour',1,'draft','Explore the Straddie Noticeboard Network',
   'Learn where to find local notices, use the practice board and see who issues important updates.',
   json_array(
     json('{"title":"Find a public notice","body":"Open the homepage, then visit the board and try a filter. Read the named publisher, place, source and expiry before relying on the information. Look at the training page for the practice workflow.","captureNotes":"Capture the public board and training page using a fictional notice. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Follow a changed plan","body":"Compare a notice with its public source. If a transport or official warning matters to your plans, check the issuing agency directly. Send a correction or question to the responsible contact.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A notice gives a ferry time and its source. Where do you confirm a change?","choices":[{"id":"correct","text":"With the named transport operator’s current information"},{"id":"alternative","text":"With the oldest copy still visible on a shared screen"}],"correct_choice_id":"correct","explanation":"The latest source is the place to confirm what applies.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Show a fictional visitor which board filter to use, how to check one notice and where to verify an important change.'),
  ('noticeboard-community-contributor',1,'draft','Noticeboard community contributor welcome',
   'Draft a useful notice and share it with the right person for review.',
   json_array(
     json('{"title":"Prepare a draft","body":"Open the draft editor. Write a clear headline, place, start time, expiry and the public source. Include only the contact information and images agreed for publication.","captureNotes":"Show the browser draft editor and a fictional arts-night notice. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Choose the outlets","body":"Select where you would like the notice to appear: web, venue TV or touch kiosk. Preview each requested outlet and give the approved reviewer a review copy with those choices.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Does exporting the review copy put a notice on screens?","choices":[{"id":"alternative","text":"It automatically publishes it at each venue"},{"id":"correct","text":"It prepares a draft for the reviewer"}],"correct_choice_id":"correct","explanation":"The reviewer still needs to confirm content and the authorised outlets.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional event notice and review note with its source, expiry, intended outlets and one privacy check.'),
  ('noticeboard-business-publisher',1,'draft','Noticeboard local business publisher welcome',
   'Prepare clear business information and nominate who can approve corrections.',
   json_array(
     json('{"title":"Choose information people can act on","body":"Check a public business listing or service-hours notice. State the business name, location, hours, source and end date for a temporary change. Confirm who can speak for the business.","captureNotes":"Use the public business directory and a made-up closure or opening-hours change. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Review permission before offering it","body":"Get approval for the selected outlet, contact details and images. Give the reviewer a way to check the details and tell them which person will confirm changes or request removal.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"When a temporary notice ends, what should the reviewer have?","choices":[{"id":"correct","text":"A clear expiry and a contact who can confirm the next update"},{"id":"alternative","text":"An instruction to keep showing it until someone complains"}],"correct_choice_id":"correct","explanation":"A clear expiry prevents out-of-date information from carrying on.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a fictional business hours notice and a follow-up correction. Identify the approving contact, expiry and selected outlets.'),
  ('noticeboard-editorial-review',1,'draft','Noticeboard reviewer desk',
   'Check the source, scope and approval of a notice before authorising display.',
   json_array(
     json('{"title":"Review against the original","body":"Match the draft with the named public source. Check the place, timing, publisher approval and permissions for people and images. Compare the content against the intended outlet and return unclear items to the issuer.","captureNotes":"Capture a fictional draft and reviewed example from the public publishing guide. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Check each update","body":"Agree the revised wording and effective time. Record who reviewed it and when, the intended outlets and the expiry. Tell the steward and venue contact how to check a correction or withdrawal.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"The copy asks for kiosk display but the issuer approved only web. What do you do?","choices":[{"id":"alternative","text":"Add it to the kiosk because the format fits"},{"id":"correct","text":"Ask for confirmation or keep the approval to web"}],"correct_choice_id":"correct","explanation":"Approval covers the agreed outlets.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Review a fictional notice with a source mismatch and a missing expiry. Write the questions to send back and the details you would record once cleared.'),
  ('noticeboard-feed-steward',1,'draft','Noticeboard feed steward handover',
   'Maintain approved records and hand over corrections, expiry and take-downs.',
   json_array(
     json('{"title":"Prepare the approved record","body":"From the reviewed copy, confirm the stable notice ID, source, responsible publisher, time checked, expiry and agreed outlets. Use the practice guide to rehearse a change under the same ID.","captureNotes":"Show the public practice board with a staged feed example. Keep write access and credentials private. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Promote and verify a correction","body":"Follow the current authorised publishing process. Have the relevant host confirm what is actually showing. Record a take-down or withdrawal and escalate when the feed or display cannot be checked.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"The time changes for the same event. How should the steward identify it?","choices":[{"id":"correct","text":"Keep the notice ID and record a fresh review and correction"},{"id":"alternative","text":"Create a duplicate notice and leave the first one live"}],"correct_choice_id":"correct","explanation":"A stable identity helps remove the outdated version from the same locations.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional correction and take-down plan covering the old and new times, review, outlets, host checks and what to do if the feed is unavailable.'),
  ('noticeboard-venue-host',1,'draft','Noticeboard venue host welcome',
   'Prepare to host a public screen and agree who maintains it.',
   json_array(
     json('{"title":"Agree what the screen is for","body":"Identify the host contact, audience, allowed outlets, local notices and opening hours. Work through power, connectivity, physical access and equipment responsibility before confirming a trial.","captureNotes":"Capture the public hosting or pilot page and a fictional venue setup. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Check what visitors actually see","body":"Practise opening the display, identifying when it was checked and reporting an issue. Agree how staff handle a stale notice, an unavailable feed and an official warning.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A stale notice is still showing. What should a host do?","choices":[{"id":"alternative","text":"Change the issuer’s wording directly on the venue screen"},{"id":"correct","text":"Use the agreed stale-display procedure and contact the steward"}],"correct_choice_id":"correct","explanation":"The host can deal with the display while the responsible publisher or steward confirms the notice.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Make a venue handover card with an opening check, fault contact, stale notice action and end-of-day step.'),
  ('noticeboard-screen-caretaker',1,'draft','Noticeboard screen caretaker handover',
   'Check screen uptime and record which device, notice and connection need follow-up.',
   json_array(
     json('{"title":"Check display, connection and source","body":"Use the practice display to identify the device, outlet, last check and feed state. Compare it with a current source and report what appears on the actual screen.","captureNotes":"Record the public practice screen and one fictional offline rehearsal. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Log the fault and return to service","body":"Record the time, observed status and who owns the response. Follow the agreed local checklist. Verify the display and notify the venue or steward when the checked service is restored.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A connection is down. What should you pass on first?","choices":[{"id":"correct","text":"What the display shows, when checked and the responsible contact"},{"id":"alternative","text":"A claim that the feeder service has recovered"}],"correct_choice_id":"correct","explanation":"The recorded observation lets the responsible person decide what to do.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional outage log with three checkpoints and a clear return-to-service check.'),
  ('noticeboard-welcome-volunteer',1,'draft','Noticeboard visitor welcome volunteer',
   'Point visitors to sources and practise a safe handover when plans change.',
   json_array(
     json('{"title":"Check in and find the current briefing","body":"Confirm the lead, location and duty. Compare the welcome briefing with the current source before directing a visitor. Know how to contact the venue and the notice steward.","captureNotes":"Use the public visitor and volunteer rehearsal. Leave real guest information off-screen. Reference site: https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"}'),
     json('{"title":"Hand over a change","body":"Report the old and new instructions, source, time checked and unresolved question to the lead. Ask them to confirm the wording visitors should use while a screen is offline.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should you tell the next volunteer about a changed meeting point?","choices":[{"id":"alternative","text":"Only that the plan has changed"},{"id":"correct","text":"The current verified location, source and who to ask"}],"correct_choice_id":"correct","explanation":"A useful handover tells the next person exactly what to check and say.","source_refs":["https://straddie-noticeboard-cloudflare.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a short handover for the fictional Dunwich welcome briefing after a screen outage and entrance change.')
ON CONFLICT (course_id,revision) DO NOTHING;

-- Minjerribah Screen & Media Network
INSERT INTO learning_courses (id,category_id,site_id,provider_name) VALUES
  ('msmn-site-tour','site-tours','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-story-contributor','member-start','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-trainee','member-start','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-producer','community-media','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-research-writer','community-media','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-camera-sound','community-media','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-edit-caption','community-media','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-permissions','community-media','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-screen-crew','events','msmn-training','Minjerribah Screen & Media Network'),
  ('msmn-host','member-start','msmn-training','Minjerribah Screen & Media Network')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learning_course_versions (course_id,revision,state,title,description,lessons_json,practical) VALUES
  ('msmn-site-tour',1,'draft','Explore Minjerribah Screen & Media Network',
   'Find the public project ideas, connected work, participation routes and sources.',
   json_array(
     json('{"title":"Tour the public pages","body":"Start with the opening page. Follow the network, places, funding and participation pages. Keep project ideas, illustrative budgets and actual invitations distinct in your notes.","captureNotes":"Capture the public site’s navigation and sources page using only material cleared for public viewing. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Pick a route to explore","body":"Choose a story, screen, venue, crew or workshop idea. Use the sources and participation links to find the responsible contact. Check how a named project or organisation describes its own status.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What does a connection to another project establish?","choices":[{"id":"correct","text":"A related idea or source to explore"},{"id":"alternative","text":"That the organisation has agreed to deliver the proposal"}],"correct_choice_id":"correct","explanation":"A connection can be useful without establishing someone else’s commitment.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Write a short orientation for a fictional visitor linking one project idea, its source and the participation route.'),
  ('msmn-story-contributor',1,'draft','MSMN Story contributor welcome',
   'Bring a local story idea and identify whose knowledge and permissions matter.',
   json_array(
     json('{"title":"Write a first story note","body":"Describe the story, possible audience and why it matters locally. Note who should be asked first and which sources can be verified. Where a story involves cultural knowledge, ask the appropriate custodians about authority and possible uses.","captureNotes":"Capture a made-up pitch card and the public Join the build page. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Agree the boundaries before collecting","body":"Discuss what contributors are willing to share, with whom and in which channels. Record credits and any limits. Ask the responsible producer how to handle material if a person changes their mind.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Who can decide the permitted use of cultural knowledge?","choices":[{"id":"alternative","text":"The person editing the website"},{"id":"correct","text":"The appropriate authorised custodians"}],"correct_choice_id":"correct","explanation":"Publishing access does not confer cultural authority.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Draft a fictional story pitch with intended audience, two people or authorities to ask, one excluded detail and the next permission decision.'),
  ('msmn-trainee',1,'draft','MSMN Media trainee welcome',
   'Choose a practical starter task and agree supervision, equipment and feedback.',
   json_array(
     json('{"title":"Find a starter task","body":"Select something small enough to practise during a workshop, such as logging a take, checking a caption or writing a shot description. Confirm who will demonstrate it and provide feedback.","captureNotes":"Show a fictional workshop list and chosen task card. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Finish with a useful handover","body":"Return equipment and describe what you produced, where it is kept and whether it cleared review. Ask what you should practise next. Agree separately whether you can use any work in a portfolio.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"You helped edit a clip in a workshop. What should you check before adding it to a portfolio?","choices":[{"id":"correct","text":"Whether the agreed rights and relevant people allow that use"},{"id":"alternative","text":"Whether you saved the file to your device"}],"correct_choice_id":"correct","explanation":"Access to a file and permission to publish it are separate.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Write a training agreement for a fictional 30-minute task with a demonstration, a feedback check and a handover.'),
  ('msmn-producer',1,'draft','MSMN Producer and project coordinator handover',
   'Move a proposal from idea to an agreed plan for people, place, equipment and approvals.',
   json_array(
     json('{"title":"Set a workable scope","body":"Write what the project will deliver, the audience and what can fit the available team and resources. Assign someone to confirm the venue, permissions, funding status and each public claim.","captureNotes":"Record a fictional project card beside the public network or funding page. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Hand over the production record","body":"Give the next lead the approved brief, current run sheet, status of permissions, cost assumptions, next decisions and ready contacts. Label prospective partners by their actual level of involvement.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"An organisation says it is interested. How should it appear in the plan?","choices":[{"id":"alternative","text":"As confirmed delivery partner"},{"id":"correct","text":"As interested until a more specific commitment is agreed"}],"correct_choice_id":"correct","explanation":"The team needs accurate commitments to plan with.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Make a fictional one-page production handover for a local short film. Include a named decision owner, two dependencies and an agreed next checkpoint.'),
  ('msmn-research-writer',1,'draft','MSMN Researcher and writer handover',
   'Turn an idea into a short verified story brief with permission to use the material.',
   json_array(
     json('{"title":"Start with the claim and source","body":"List the main facts the story needs, their sources and the people who can verify disputed or unclear details. Label reconstructions and creative elements in your working brief.","captureNotes":"Show a fictional story treatments folder with source and open-question columns. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Prepare the interview and review","body":"Draft questions, check proposed naming and public uses, agree the review step with the producer and pass on the fact-check list. Keep things the source restricted outside the shared edit.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"How should a draft label an unverified claim?","choices":[{"id":"correct","text":"Flag it for checking with the appropriate source"},{"id":"alternative","text":"Write it as a confirmed fact until challenged"}],"correct_choice_id":"correct","explanation":"The editor must see where evidence is still needed.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Create a six-line fictional story brief with one verified fact, one research question, an interview contact role and a use restriction.'),
  ('msmn-camera-sound',1,'draft','MSMN Camera and sound crew',
   'Make a simple, usable recording and hand its files to the editor.',
   json_array(
     json('{"title":"Check the shoot before rolling","body":"Read the brief and permitted shots, locations and people. Check framing, sound and recording levels with a short test. Agree a way to signal a problem and confirm which filename or slate identifies the take.","captureNotes":"Capture a tabletop demonstration with no private subject or recognisable record. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Log and transfer the takes","body":"Record the useful take names, sound problems and permission restrictions. Make the agreed backup and transfer to the authorised editor. Keep originals and the handover log together.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"You notice a good take includes a person whose permission is unclear. What goes in the handover?","choices":[{"id":"alternative","text":"Leave the detail out so the editor can decide from the picture"},{"id":"correct","text":"Flag the take and hold that use for review"}],"correct_choice_id":"correct","explanation":"The editor needs the restriction alongside the media.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Produce a fictional three-shot plan and write a two-take handover with one missing permission and a suggested reshoot.'),
  ('msmn-edit-caption',1,'draft','MSMN Editing and captions',
   'Make a short edit that carries its source, captions and approvals through to delivery.',
   json_array(
     json('{"title":"Assemble a review cut","body":"Start from the agreed brief and authorised files. Keep the originals, identify the revision and mark rough or restricted material for review. Verify that names and dates match the checked sources.","captureNotes":"Capture a fictional timeline and the exported review cut filename. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Check captions and exports","body":"Check that captions match the spoken words, timing and relevant sounds. Review the output in its intended landscape or portrait layout. Pass the approved source, credits and release conditions to whoever publishes it.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Which version should move to the publishing step?","choices":[{"id":"correct","text":"The identified reviewed cut with checked captions, credits and permissions"},{"id":"alternative","text":"The newest file automatically"}],"correct_choice_id":"correct","explanation":"A later export might still be a working draft.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Draft an edit checklist for a fictional 45-second clip. Include a caption correction, a permission check and two output contexts.'),
  ('msmn-permissions',1,'draft','MSMN Permissions and cultural review coordination',
   'Plan the permissions and evidence trail for a story, recorded activity or screening.',
   json_array(
     json('{"title":"Identify the person who can decide","body":"List the material, its source, intended audiences, and who holds relevant permission. Approach the appropriate cultural custodians about cultural material. Ask for the method and scope of review they want.","captureNotes":"Use a fictional permission register without real identities, private files or sensitive knowledge. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Hand over the limits with the assets","body":"Record what use was agreed, who made the decision, any expiry or review date and what the team must withhold. Give the crew and editor the relevant instruction before capture or release.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Does the producer’s approval cover cultural material by itself?","choices":[{"id":"alternative","text":"Treat the production plan as cultural permission"},{"id":"correct","text":"Check for the appropriate custodian’s approval and its scope"}],"correct_choice_id":"correct","explanation":"The appropriate custodian decides the use of cultural material.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Write a fictional permissions table with one cleared use, one limited use and one item still awaiting a decision. Record how the editor will know which is which.'),
  ('msmn-screen-crew',1,'draft','MSMN Screening and event crew',
   'Set up an agreed screening, welcome the audience and hand back equipment.',
   json_array(
     json('{"title":"Prepare the run sheet","body":"Confirm the screening and venue decisions with the lead. Allocate projection, sound, audience welcome, accessible seating and pack-down. Ask who can pause or change the programme.","captureNotes":"Record a practice set-up and a fictional crew run sheet. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Rehearse failures and close the session","body":"Test the agreed file and captions, then practise what the lead will do if equipment or conditions change. At the end, return gear, report faults and record the handover.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Who confirms a public change to the screening plan?","choices":[{"id":"correct","text":"The responsible event lead through the agreed channel"},{"id":"alternative","text":"Each crew member posting their own version"}],"correct_choice_id":"correct","explanation":"One confirmed message helps the audience and crew follow the same plan.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Write a fictional screening crew card with a sound or subtitle test, setup owner, change contact and gear check at handover.'),
  ('msmn-host',1,'draft','MSMN Venue host and local partner welcome',
   'Work through a proposed screening or workshop before confirming a venue or support.',
   json_array(
     json('{"title":"Work out what you can offer","body":"Describe possible space, availability, people, equipment or support. Ask what the organiser can supply, who will supervise, and what publicity or attribution would be appropriate.","captureNotes":"Use a fictional venue discussion, with the public hosting or participation route on screen. Reference site: https://auraofintelligence.github.io/minjerribah-screen-media-network/"}'),
     json('{"title":"Check the agreement and follow-up","body":"Discuss access, responsibilities, restrictions, dates, costs and the decision still needed. Agree how the proposed collaboration may be described while the discussion is underway.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"When may a venue be listed as confirmed?","choices":[{"id":"alternative","text":"As soon as a site is shown in a concept illustration"},{"id":"correct","text":"After the responsible people agree the venue use and public wording"}],"correct_choice_id":"correct","explanation":"A concept is a starting point for checking terms.","source_refs":["https://auraofintelligence.github.io/minjerribah-screen-media-network/"]}]}')
   ),
   'Write a fictional host enquiry response with an available option, one important restriction and the next confirmation step.')
ON CONFLICT (course_id,revision) DO NOTHING;

-- Ready SETCO Skills & Work
INSERT INTO learning_courses (id,category_id,site_id,provider_name) VALUES
  ('training-site-tour','site-tours','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-local-work','working-holiday','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-working-holiday','working-holiday','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-employer-founding','employers','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-employer-onboarding','employers','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-grant-writing','grants','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-grant-delivery','grants','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-volunteer','volunteers','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-crew','events','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-digital-stewardship','digital-stewardship','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-ai-work-skills','digital-skills','ready-setco-training','Ready SETCO Skills & Work'),
  ('training-committee-basics','committee','ready-setco-training','Ready SETCO Skills & Work')
ON CONFLICT (id) DO NOTHING;

INSERT INTO learning_course_versions (course_id,revision,state,title,description,lessons_json,practical) VALUES
  ('training-site-tour',1,'draft','Find your way around Ready SETCO',
   'Explore the public lessons, local project pages, private portal and ways to take part.',
   json_array(
     json('{"title":"Start with a public page","body":"From the homepage, open Take part and try the sample volunteer lesson. Explore Training & work, the community map and the proposed cooperative formation pages for routes that suit you.","captureNotes":"Capture the public home and sample lesson. Use the public pages in the recording. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Choose the next step","body":"Send an enquiry if you want a private follow-up. Use your own portal account when you need to access a group, see assigned courses or keep a private participation record. Ask the organiser which process applies to your goal.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Where can someone try a lesson before signing in?","choices":[{"id":"correct","text":"The sample lesson on Take part"},{"id":"alternative","text":"A private committee desk"}],"correct_choice_id":"correct","explanation":"The Take part preview is open to visitors.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a quick guide for a fictional newcomer with one public activity, one way to enquire and one reason they might use the portal.'),
  ('training-local-work',1,'draft','Get ready for local paid work',
   'Prepare a short work profile and ask useful questions before taking on a local job.',
   json_array(
     json('{"title":"Describe what you can do","body":"List relevant tasks, experience and availability. Pick one example that shows your skill. Keep identity documents and contact details out of public posts. Offer any evidence through the agreed private review process.","captureNotes":"Use a fictional Learning & work profile in an authorised test account. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Clarify a role before saying yes","body":"Ask who the employer is, what work is required, where and when it happens, who supervises and what training or checks apply. Ask how pay and work arrangements will be confirmed.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Which detail should be clear before agreeing to a role?","choices":[{"id":"alternative","text":"Only the name of a project"},{"id":"correct","text":"The actual employer, duties, arrangements and supervisor"}],"correct_choice_id":"correct","explanation":"The actual role determines what you and the employer need to agree.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional profile and a short message to an employer asking about duties, hours, training and the next step.'),
  ('training-working-holiday',1,'draft','Prepare for working holiday work',
   'Find the official sources, keep useful work records and ask what a role involves.',
   json_array(
     json('{"title":"Check the current rules for your situation","body":"Use the relevant Home Affairs pages and the official work-rights process where applicable. Match the actual job, location and dates to the current guidance for your situation. Keep the source and date of your check.","captureNotes":"Show the site’s working-holiday pathway and where to find current official pages. Use fictional records and avoid displaying personal documents. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Prepare records and ask before you start","body":"Ask the employer about the actual tasks, location, pay and records they provide. Agree how to keep payslips, contracts and work dates. Treat community volunteering as a separate activity and check any claim about specified work with the official source.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A job listing claims it will count. What should you do?","choices":[{"id":"correct","text":"Check the current official rules against the actual role and location"},{"id":"alternative","text":"Rely on the listing’s claim by itself"}],"correct_choice_id":"correct","explanation":"The relevant official conditions and actual work matter.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a fictional job enquiry with four questions, a place to record your official check and a list of employment evidence you would keep.'),
  ('training-employer-founding',1,'draft','Local employers helping found Ready SETCO',
   'Prepare a contribution to the cooperative’s first decisions and identify what needs an agreement.',
   json_array(
     json('{"title":"Bring one need and one offer","body":"Name a local employment, training or resource need. Describe what the business might contribute and what conditions it would need. Use the declared formation status when speaking to staff or other businesses.","captureNotes":"Capture the public participation and formation pages with a fictional local employer. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Move from discussion to an accountable decision","body":"Separate a founding idea from an approved contribution or recruitment arrangement. Identify who can authorise each commitment and who keeps the record. Discuss which responsibilities the business would retain.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"Can a founding enquiry commit a business to an agreement?","choices":[{"id":"alternative","text":"Yes, once an interest form is sent"},{"id":"correct","text":"A separate authorised decision and agreement are needed"}],"correct_choice_id":"correct","explanation":"An enquiry records interest and starts a discussion.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a short fictional founding brief with a contribution, condition, decision owner and first point to discuss with the formation group.'),
  ('training-employer-onboarding',1,'draft','Local employers exploring participation after formation',
   'Prepare the questions and evidence for a future employer membership or service enquiry.',
   json_array(
     json('{"title":"Compare the type of participation","body":"Ask whether you are exploring membership, sharing a resource, offering jobs or buying a service. Check the status and applicable terms when that route exists. Identify who can speak for the business.","captureNotes":"Use the public membership page and an example employer enquiry. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Confirm what the business would actually do","body":"Document responsibilities, timing, costs, information handling and who makes hiring and supervision decisions. If arranging introductions, confirm the role and what the person has agreed may be shared through the authorised process.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"How should a job introduction be handled?","choices":[{"id":"correct","text":"Confirm who is involved, the role and what the worker has agreed may be shared"},{"id":"alternative","text":"Send a list of private profiles to any interested employer"}],"correct_choice_id":"correct","explanation":"Permission and a specific role define what information can be shared.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Compare two fictional options for a local employer and draft one enrolment or service enquiry with conditions to confirm.'),
  ('training-grant-writing',1,'draft','Write a community grant proposal',
   'Turn a local idea into a clear need, workable budget and evidence checklist.',
   json_array(
     json('{"title":"Read the current programme guide","body":"Confirm the applicant, intent, eligibility, deadline and evidence with the official round material. Describe who benefits and what local evidence supports the need. Record what you still need to verify.","captureNotes":"Show the Ready SETCO Grants page and a fictional grant outline. Confirm any external round details at recording time. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Write the plan that could be delivered","body":"Connect activities, dates, costs and outcomes. Separate confirmed contributions from proposals and attach evidence of quotes or approval where the programme needs it. Have someone review the draft against the criteria.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"An unconfirmed sponsorship is included in the budget. How should it appear?","choices":[{"id":"alternative","text":"As committed income"},{"id":"correct","text":"As proposed with an owner to confirm it"}],"correct_choice_id":"correct","explanation":"Budget reviewers need the funding status to judge whether the plan is viable.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft a fictional grant summary, three budget lines, one eligibility check, an outcome and a source of evidence.'),
  ('training-grant-delivery',1,'draft','Deliver and report on a funded project',
   'Track commitments, approvals, receipts and outcomes from the first day of a fictional project.',
   json_array(
     json('{"title":"Set up the delivery checklist","body":"Read the agreed funding conditions. Record milestones, eligible spending instructions, receipts, who can approve changes and how to ask for a variation. Start the evidence folder before spending.","captureNotes":"Capture a fictional budget and milestone register with no real invoices or banking details. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Prepare the close-out","body":"Compare approved and actual costs, report what changed and collect acceptable evidence of the outcome. Keep the reporting deadline, approval steps and outstanding issues visible to the next officer.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A major cost changes during delivery. What should you check first?","choices":[{"id":"correct","text":"The funding agreement and the authorised change process"},{"id":"alternative","text":"Only the total funds remaining"}],"correct_choice_id":"correct","explanation":"A change can affect which costs or activities are authorised.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a fictional close-out with budget versus actuals, one approved change, two outcomes and where their evidence is kept.'),
  ('training-volunteer',1,'draft','Your first community volunteer shift',
   'Choose a task, meet the shift lead and leave the next person a useful handover.',
   json_array(
     json('{"title":"Confirm the shift","body":"Ask where and when to check in, what work has been agreed, what training or gear you need and who makes a change-of-plan decision. Raise access needs with the lead.","captureNotes":"Use a fictional event run sheet and show a sample shift briefing. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Close out your work","body":"Return the agreed equipment, tell the lead what was done and hand over unfinished actions. Ask how concerns and incidents are recorded. If the project is trialling voluntary contribution records, agree who could verify the time.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"If your task changes, who should you check with?","choices":[{"id":"alternative","text":"A visitor who asks you to take it over"},{"id":"correct","text":"The person responsible for the shift"}],"correct_choice_id":"correct","explanation":"The lead can confirm the change and any support you need.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional shift briefing and handover covering check-in, role, weather decision and equipment return.'),
  ('training-crew',1,'draft','Plan a community event and crew handover',
   'Build a short run sheet and rehearse a change to a local event.',
   json_array(
     json('{"title":"Give each job an owner","body":"Confirm the venue, expected audience, lead roles and time checks. Include accessible arrival, a contact for concerns, permission checks and the decision point for changing the schedule.","captureNotes":"Record a fictional event run sheet and point out the owner, due time and backup in each row. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Rehearse the handover","body":"Practise a late venue change with the crew. Ask the authorised person to confirm the public wording and updated channels. At close, check the equipment and record any issue for the next team.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What should a crew handover contain after a change?","choices":[{"id":"correct","text":"The agreed update, source, people responsible and what still needs doing"},{"id":"alternative","text":"Just the name of the event"}],"correct_choice_id":"correct","explanation":"The next team needs instructions and open actions they can verify.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a fictional run sheet with a venue contact, three crew jobs, one change decision and a closing check.'),
  ('training-digital-stewardship',1,'draft','Record a place with permission',
   'Practise care with map entries, local research sources and decisions about what may be shared.',
   json_array(
     json('{"title":"Record a useful observation","body":"Choose a fictional public place. Record what you saw, when, how to check it and what people need to know. Explain where a map pin or photograph came from and the audience it suits.","captureNotes":"Use a fictional map entry and the Ready SETCO public map or Cultural Intelligence Node reference material. Do not submit a live example. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Keep ownership and limits with the record","body":"Before sharing locations, personal details or cultural knowledge, ask who has authority and which audience and uses they approve. Preserve corrections and contact the custodian if the approved scope changes.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"A source supplies a location with restricted access. What should you do?","choices":[{"id":"alternative","text":"Copy it into a public map so people can verify it"},{"id":"correct","text":"Record the restriction and confirm any intended use with the authorised custodian"}],"correct_choice_id":"correct","explanation":"Anyone handling the record needs the same use instructions.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Draft a fictional observation with its source, check date, approved audience and one item that would stay in the private working record.'),
  ('training-ai-work-skills',1,'draft','Use AI to help with a practical task',
   'Draft a checklist with AI and check it against a reliable human or written source.',
   json_array(
     json('{"title":"Make the request specific","body":"Choose a low-risk task such as making a fictional event checklist clearer. Describe the audience, job and output. Use fictional details and leave out private names, sensitive instructions and records.","captureNotes":"Record an example in a chosen tool using made-up inputs. Show the prompt and draft as separate items. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Check every instruction before using it","body":"Compare the answer with the real, authorised process. Remove guesses, confirm names or facts with the source and ask the responsible person to review it. Keep the useful prompt and the corrected version together.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"An AI draft invents a venue rule. What should you do?","choices":[{"id":"correct","text":"Check the actual venue source and correct or remove it"},{"id":"alternative","text":"Keep it because it sounds plausible"}],"correct_choice_id":"correct","explanation":"The venue rules need a source that has authority.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Write a short fictional prompt, show one improvement from the AI draft, identify a claim needing verification and give your checked final wording.'),
  ('training-committee-basics',1,'draft','Run a meeting and hand over decisions',
   'Practise preparing an agenda, recording a decision and giving the next officer a clear handover.',
   json_array(
     json('{"title":"Prepare the decision","body":"Set out the purpose, topic and decision required. Check who can take part in it, how interests should be handled and what evidence is available. Keep a versioned draft agenda.","captureNotes":"Show a made-up meeting using the public Ready SETCO formation planner. Reference site: https://ready-setco.auraofintelligence.workers.dev/"}'),
     json('{"title":"Write what happens next","body":"Record the actual approved wording, date and action owner. Give the incoming officer the decision source, open issues, relevant authorised access and a check-in date.","questions":[{"id":"first-check","type":"single_choice","mode":"practice","prompt":"What makes a decision record useful to someone taking over?","choices":[{"id":"alternative","text":"A generic note that the topic was discussed"},{"id":"correct","text":"The actual decision, its source, an action owner and due date"}],"correct_choice_id":"correct","explanation":"The next officer can verify the decision and continue the work.","source_refs":["https://ready-setco.auraofintelligence.workers.dev/"]}]}')
   ),
   'Prepare a fictional agenda, one decision and three handover actions. Mark one item that needs authority or a follow-up check.')
ON CONFLICT (course_id,revision) DO NOTHING;
