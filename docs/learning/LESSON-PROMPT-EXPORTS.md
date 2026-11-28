# ReadySETCO lesson prompt exports

Copy the prompts below into any model, one at a time. Fill in the input at the bottom of each prompt. Save the actual prompt and reply with the lesson. Record the date, prompt revision, model or provider when known, and the main human correction. The [PLFC handover pilot brief](PLFC-HANDOVER-PILOT-BRIEF.md) is ready to use with Prompt 1.

## 1. Draft the lesson and plan the recording

```text
ReadySETCO lesson drafting and capture prompt, revision 1

Draft one task-based lesson using the source material under INPUT. Write plain Australian English for the stated audience. Keep approved procedures intact and use fictional examples.

Return Markdown with these headings.

## Outcome
State one observable task the learner should be able to do.

## Draft walkthrough
Give a worked example, the learner's steps and draft narration where a recording helps. Mark each unverified screen, control name or action "Needs capture".

## Capture plan
Use a table with shot ID, what to show, what the operator does, what must be checked and the intended asset. Label timing estimates. Give the operator a starting screen or sample and a stopping point.

## Practice and practical
Draft two relevant practice questions with explanations, one practical task and two or three observable criteria. Flag anything that depends on a capture or club decision.

## Questions for the pilot lead
List unresolved facts, recording needs or permissions. Flag any suggested step that would require real learner or member data or a live change.

INPUT
[Paste the approved source notes, audience and task brief here.]
```

## 2. Generate the lesson from the actual capture

Paste the reviewed plan and capture notes. Attach sanitised screenshots or clips if the tool supports them. For a text-only model, include observed labels, measured timings and the transcript.

```text
ReadySETCO lesson reconciliation prompt, revision 1

Revise the draft using the human capture log, observed screens and transcript under INPUT. Use the recording as evidence of what appears on screen and the approved brief for club procedures. If the sources disagree, record the discrepancy for review. Mark missing labels, timings or evidence "Needs capture". Use plain Australian English and fictional records.

Return three labelled sections.

LESSON.md
Write the outcome, one worked example, the ordered learner steps, media references by shot ID, alternative text for each essential screenshot and a readable transcript when one is supplied. Use measured timecodes only. If captions need timing, give the editor untimed text and say which asset needs timing. Provide a text version of anything essential conveyed only by a visual.

QUESTIONS.json
Use the file shape supplied under INPUT. Provide a clear rationale for each correct choice. Use plausible incorrect options. The practical must test the stated outcome with fictional records. Mark each criterion as required or optional. Keep answers in the author or assessor material.

REVIEW.md
List the evidence used, important corrections, gaps to check, and any permission to confirm for the intended audience. Leave human approval pending.

INPUT
[Paste the reviewed plan, capture notes, and transcripts here.]
[Paste the QUESTIONS.json example from the guide here.]
```

### QUESTIONS.json example

This is the author copy. A scored answer key stays private. Practice explanations can appear after a learner answers.

```json
{
  "format_version": 1,
  "lesson_id": "plfc-handover-open-actions",
  "questions": [
    {
      "id": "q-01",
      "type": "single_choice",
      "mode": "practice",
      "prompt": "Which entry can the incoming officer act on?",
      "choices": [
        { "id": "a", "text": "Follow up equipment." },
        { "id": "b", "text": "Morgan to confirm equipment return by 10 December, based on decision M-12." }
      ],
      "correct_choice_id": "b",
      "explanation": "This entry gives the next officer an owner, due date and source reference.",
      "source_refs": ["BRIEF:fictional-records"]
    }
  ],
  "practical": {
    "task": "Write a handover entry for three fictional open actions.",
    "criteria": [
      { "id": "c-01", "description": "Each action has a named owner and due date.", "required": true },
      { "id": "c-02", "description": "Each action points to the relevant fictional decision or source.", "required": true },
      { "id": "c-03", "description": "The handover flags one unresolved issue for the first-week check-in.", "required": true }
    ]
  }
}
```

## 3. Check accuracy and consistency

Use the same model or another one. Include the approved sources as well as the generated lesson. Luke helps check the first runs against the real workflow.

```text
ReadySETCO lesson consistency review prompt, revision 1

Check the lesson and assessment against the approved brief, observed capture notes and transcript under INPUT. Check the outcome, exact screen labels, action order, question options, answer key and practical criteria. Check that essential visual information is also available as text, and that transcript and caption status are described accurately.

Return a table with location, finding, source or missing evidence, and proposed fix. Label each finding "Correction", "Needs capture" or "Wording". Identify any conflict between the sources and any signs of real member data or uncertain reuse permission. End with "Human review pending".

INPUT
[Paste the brief, sanitised capture notes, lesson, question source and relevant transcripts here.]
```

## Human review record

Copy this into `REVIEW.md`. Attach a comparison of model outputs when it informs a decision.

```text
Lesson ID and version:
Capture date and interface version if known:
Prompt revision, model and run date:
Tested by and date:
Result of following the learner steps:
Corrections and supporting shot or source:
Question and practical checks:
Caption, transcript and phone readability:
Permission and intended audience:
Decision and reviewer:
Approved files or remaining capture tasks:
```
