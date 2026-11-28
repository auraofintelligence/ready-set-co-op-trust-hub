# ReadySETCO learning platform blueprint
## What to borrow from established platforms and how to implement it

28 November 2026 · Research and design brief

### Recommendation

Keep ReadySETCO as the place people sign in, take courses and see completed training alongside their work and volunteering profile. Build a visual lesson editor with reusable blocks and a dedicated assessment area. The first courses should demonstrate real PLFC tasks through annotated screenshots and short screencasts, give learners a chance to practise, and then assess whether they can carry out the task.

The live portal already has private learning groups, course drafts and release versions, enrolment, saved lesson progress, a written practical and assessor sign-off. The gaps are a media library, visual lesson authoring, a player with captions and transcripts, and structured questions with feedback. The changes in this brief are proposals.

## Platform benchmark

| Platform | Documented capability | What ReadySETCO should borrow |
| --- | --- | --- |
| **Open edX** | Studio organises courses into units containing content components. Video and problem components sit inside that structure. The authoring guidance covers transcripts. [Course units](https://docs.openedx.org/en/latest/educators/concepts/open_edx_platform/about_course_units.html) · [Video guidance](https://docs.openedx.org/en/latest/educators/references/course_development/guide_to_video.html) | Make a lesson a sequence of independent blocks. Authors can add or move a screenshot, clip, text or question without rewriting the rest of the lesson. |
| **Articulate Rise 360** | Labeled Graphic, Process and Scenario blocks present information through interactive markers, steps and decision points. [Labeled Graphic](https://www.articulatesupport.com/article/Rise-How-to-Use-Labeled-Graphic-Blocks) · [Process](https://www.articulatesupport.com/article/Rise-How-to-Use-Process-Blocks) · [Scenario](https://www.articulatesupport.com/article/Rise-360-How-to-Use-Scenario-Blocks) | Use annotated screenshots and ordered walkthroughs for interface training. Pair markers with a readable list of steps. Offer a lesson preview from inside the editor. |
| **Moodle** | Activity completion can depend on a defined condition. Question behaviour controls when feedback appears and whether learners can retry. Question banks separate items from delivery. [Activity completion](https://docs.moodle.org/503/en/Activity_completion) · [Question behaviours](https://docs.moodle.org/503/en/Question_behaviours) · [Question banks](https://docs.moodle.org/503/en/Question_bank) | Give each activity a purpose and completion rule. Let authors reuse questions by version. Give feedback during practice and set explicit rules for scored checks. |
| **Canvas and Canvas Studio** | Studio supports timeline questions in videos. New Quizzes supports item banks and stimulus content. SpeedGrader supports rubrics for human review. [Studio video quizzing](https://community.instructure.com/en/instructure/kb/articles/660528-how-do-i-use-canvas-studio-video-quizzing) · [New Quizzes](https://community.instructure.com/en/kb/articles/662768-what-is-new-quizzes) · [SpeedGrader](https://community.instructure.com/en/instructure/kb/articles/662775-what-is-speedgrader) | Ask a question against a specific screenshot or video moment. Give assessors one view of the prompt, learner work, rubric and feedback. Keep a normal question list available alongside timed prompts. |
| **H5P** | Interactive Video and Branching Scenario provide reusable interaction patterns. H5P publishes accessibility recommendations by content type. [Interactive Video](https://h5p.com/content-types/interactive-video) · [Branching Scenario](https://h5p.org/branching-scenario) · [Accessibility recommendations](https://help.h5p.com/hc/en-us/articles/7505649072797-Content-types-recommendations) | Start with accessible scenario choices and optional cues during a video. Add an H5P integration when an actual course needs richer interactions and its content types pass accessibility and privacy checks. |

This comparison is based on documented capabilities. It supports design choices for ReadySETCO without ranking the overall products. The teaching pattern is **show a worked example, ask the learner to recall or apply it, give feedback, and assess a realistic task**. The What Works Clearinghouse practice guide supports combining graphics with verbal descriptions, alternating worked examples with practice, and using retrieval questions. [Practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1)

## The learner experience

| Part of a lesson | What the learner actually does |
| --- | --- |
| **Goal** | Sees one observable outcome, such as “Hand over three open actions with owners and due dates.” |
| **Watch or follow** | Plays a captioned screencast with a transcript or follows readable screenshot steps. Video loads on request. The text and visual alternatives remain available on a slow connection. |
| **Try it** | Uses fictional records to practise the same action. A worked example models what good looks like and explains the decisions. |
| **Check understanding** | Answers a question about the example or a new scenario, gets feedback explaining the choice, then retries or continues under the lesson rules. |
| **Show you can do it** | Completes a realistic task. An assessor can pass it or request a revision with feedback tied to specific criteria. |
| **Resume and review** | Sees which activity is next and what has been completed. Can return to a transcript, screenshot or feedback without overwriting an assessment submission. |

Make the catalogue visual through recognisable course covers or illustrations, plain titles, clear section boundaries and visible progress. Inside a lesson, use images to explain the task. Own progress, resume points and assessment status should persist across devices. Learners should be able to see which activities are required, how completion is decided, who can review a submission and what feedback they received.

## The course builder

| Authoring area | Controls to include |
| --- | --- |
| **Outline** | Add, duplicate, reorder and rename lessons and blocks. Support keyboard move controls. Show draft or published state, version, and who last edited it. |
| **Screenshots** | Upload or reuse an image, crop to the relevant controls, add a caption and alternative text, and add numbered callouts with equivalent text steps. Preserve text readability at mobile size and let learners enlarge the image. Require authors to confirm they inspected it for private data. |
| **Videos** | Attach a permissioned video or a public video the author can use. Set title, duration, poster, chapters, captions and transcript. Show processing and caption readiness. Offer short cues tied to video time with the same content reachable outside the player. |
| **Questions** | Add single-choice, multiple-select, or short written responses. Reuse an existing question from the group bank. Edit options, answer keys, rationale, feedback, attempt rules and weighting. Link questions to the relevant activity or outcome. |
| **Practical and rubric** | Give learners a task and a worked example. Authors define observable criteria and mark which are required. Assessors review the private submission, record feedback against each criterion and request a revision if needed. |
| **Preview and publish** | Preview as a learner at desktop and phone widths. Check permissions, caption/transcript coverage, alternative text, questions, applicable completion rules and broken media. Publish an immutable version to an explicit group. |

Support a safe path for authors to capture the existing PLFC site. They can record or screenshot a demo or fictional account, crop and redact the example, and add the source interface version and capture date. Give a reviewer a way to check whether the walkthrough still matches the interface. Use authentic screenshots from the workflow being taught. Use illustrative imagery for course covers where it helps identify the topic.

## Assessments and feedback

| Activity | Purpose and rules |
| --- | --- |
| **Practice question** | Give immediate explanatory feedback and allow another attempt. Wrong options should represent a plausible mistake. Keep practice attempts available for the learner's own reflection. |
| **Scored knowledge check** | Set the pass rule, allowed attempts and feedback release before publishing. Grade objective questions on the server. Keep answer keys out of learner responses until the applicable feedback rule permits disclosure. Record the question and course version for each attempt. |
| **Scenario question** | Give enough context to make a decision and explain the consequence of the choice. Include an accessible text option for screenshot or video cues. |
| **Written or demonstrated practical** | Use a human assessor and a rubric. Keep submitted attempts and feedback. A changes-requested decision identifies what to update, and a resubmission creates a fresh attempt. The assessor's own work goes to a different authorised reviewer. |

Define course completion in terms of required outcomes. For PLFC, a quiz about agenda items can support an officer handover, while the handover practical tests whether someone can produce a useful record. Treat a watch position as a resume aid. Use required activities and assessment decisions as completion evidence. Accessibility alternatives should lead to the same activities and rubric.

## Platform direction

| Approach | When it fits |
| --- | --- |
| **Extend ReadySETCO** | This is the recommended route. The current portal already has group permissions, versioned courses, practical review and personal records. Build the distinctive authoring, learning and evidence experience there. |
| **Connect an existing LMS** | Compare a Moodle-based deployment if bulk question administration, a broad plugin ecosystem or a requirement to exchange assessments outweighs the cost of maintaining another learning system. Evaluate identity, group isolation and completion exchange with a real pilot. |
| **Connect a specialist tool** | Bring in a video host or an interactive authoring tool for a specific feature. Keep the course outline, access rules and completion history in ReadySETCO. Test keyboard use, data sharing and exit/export before adoption. |

## A worked PLFC lesson design

**Course:** Officer onboarding and handover. **Lesson:** Pass on unfinished work.

| Sequence | Proposed learning material |
| --- | --- |
| 1. Orient | Show a fictional outgoing officer's three open actions. State the goal of giving the incoming officer a record they can act on. |
| 2. Demonstrate | Use an annotated screenshot of a real PLFC task view populated with fictional records. Show the task, owner, due date and location of the source decision. Narrate the same process in a short captioned clip. Provide the steps as text beside the screenshot. |
| 3. Ask | Show an entry that says “follow up equipment”. Ask which fields the incoming officer needs before accepting the action. Explain why a named owner, deadline and source reference make the handover usable. |
| 4. Practise | Ask the learner to complete three fictional open actions and add a date for the first-week check-in. Offer a completed example before the assessment. |
| 5. Assess | The rubric checks the next meeting and action list, named owners and due dates, access and custody checks, an unresolved issue, and a follow-up. If an item is missing, the assessor identifies it and requests a revised submission. |

The volunteer induction uses the same pattern with a fictional event run sheet, a screenshot walkthrough of shift check-in, a clip demonstrating the briefing, a weather-change scenario, and a practical that checks reporting, equipment return and handover.

## How to implement on ReadySETCO

| System | Implementation |
| --- | --- |
| **Existing identity and course access** | Extend the current participant and committee views. Resolve access from the account, training group, role and course version on each private request. Scope authors and assessors to their own groups. Keep training completion, evidence checks and club appointments as separate events. |
| **Lessons and media metadata** | Store typed blocks with stable IDs, ordering, instructional text and media references. Version the lesson, media reference, caption track, questions and rubric with the release. Keep earlier enrolments on the release they started. Preserve existing text lessons and written practicals during migration. |
| **Screenshots** | Use an authenticated upload workflow and private object storage when available. Validate allowed formats and dimensions, remove metadata, generate readable responsive variants, and retain the approved original. Deliver private files only after checking the group and release. Keep public and training-only media permissions explicit. |
| **Video delivery** | Use hosted playback for approved public material with clear provider behaviour. For private native uploads, evaluate Cloudflare Stream for direct uploads, adaptive playback, caption management and signed playback. Issue playback authorisation after checking the learner's course access. The Cloudflare account currently reports that R2 is disabled, and Stream enablement and cost have not been established. A supported existing host with verified audience controls is an alternative. An unlisted link alone is not a private access control. [Cloudflare direct uploads](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/) · [Signed playback](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/) · [Stream pricing](https://developers.cloudflare.com/stream/pricing/) |
| **Question attempts and records** | Store attempts, scoring decisions and feedback in D1. Use transactional writes and stable attempt IDs so retries cannot duplicate completions. Snapshot chosen question versions, options and grading rules. Keep assessor submissions private and provide a learner export. |
| **Privacy and access** | Collect only what the task requires. Prevent training samples from capturing live names, health details, child records, credentials or personal contact details. Make reuse rights, intended audience and retention visible during upload and publishing. Restrict access to private media even when someone copies its link. [OAIC security guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information) |
| **Portability** | Use a versioned lesson and question schema. Consider 1EdTech QTI when assessment exchange becomes necessary, and Open Badges for portable credentials when clubs or employers need to verify selected outcomes. [QTI](https://www.1edtech.org/standards/qti) · [Open Badges](https://www.1edtech.org/standards/open-badges) |

### Build and acceptance sequence

1. **Prove the editor and learner player on one PLFC lesson.** A course author can add an annotated screenshot, captioned clip and question, reorder them, preview them, and publish a version. A learner on a phone can enlarge the image, read the steps and transcript, answer the question and resume in a fresh session.
2. **Prove the assessment cycle.** A learner sees explanatory feedback after practice, submits a practical and receives a rubric decision. A revised attempt preserves the first. A pass adds one completion tied to its course version. An unrelated group, signed-out visitor or revoked learner cannot fetch restricted material or answer keys.
3. **Finish both PLFC pathways and reuse the pattern.** Add a visual and an exercise to the lessons where they serve a real learning outcome. Use them to check authoring time, media readability on phones, completion barriers and quality of assessment feedback. Extend the resulting templates to Noticeboard, Screen & Media, employer onboarding and grants.
4. **Add advanced interactions where they earn their place.** Introduce richer branching, reusable cross-group question banks, exports, badges or interactive video prompts where a course has a clear use and maintenance owner.

Use **WCAG 2.2 AA** as the accessibility target. Check keyboard-only operation, visible focus, screen-reader labels and state changes, large text, mobile reflow, caption controls, transcripts and an equivalent way to understand visual-only information. Test assessment and progress with timed cues disabled. The W3C media guidance explains the roles of captions, transcripts, description and accessible playback. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Accessible audio and video](https://www.w3.org/WAI/media/av/)
