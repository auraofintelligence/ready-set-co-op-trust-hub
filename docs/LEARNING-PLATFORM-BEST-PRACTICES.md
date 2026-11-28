# ReadySETCO learning platform blueprint
## AI-assisted lessons with human-guided capture

28 November 2026

**AI drafts the lesson, recording instructions, captions and Q&A. A human records the real workflow and checks the result.** ReadySETCO is where people take the courses and see their results. A lesson packet carries the work between models, the person recording and DaVinci Resolve.

Luke Hayes will guide the first implementations, help record the screens and test the original guidelines for consistency and accuracy. He'll identify the real workflow and help check that each lesson teaches it clearly. Keep his corrections with the AI draft and approved lesson. Use those examples to improve the guidelines before giving more of the production to automation.

Use the [copyable lesson prompts](learning/LESSON-PROMPT-EXPORTS.md) with the [PLFC handover pilot brief](learning/PLFC-HANDOVER-PILOT-BRIEF.md).

## Make a lesson

| Step | What happens |
| --- | --- |
| **1. Draft and plan** | Luke supplies a learning goal, approved sources and known screen details. A model drafts the steps, narration, shot list and Q&A. Unknown screen labels or actions become capture tasks. |
| **2. Record the workflow** | Luke guides or helps record a first pass with fictional records in a demo or sanitised view. Note the exact labels, sequence and any confusing step. Keep the raw recording and screenshots alongside the edit. |
| **3. Generate from the capture** | Give the model screenshots, a transcript or timed observations. It revises the steps, drafts screenshot callouts and captions, and writes questions against the task actually demonstrated. Use the observed workflow to correct the draft. |
| **4. Review and release** | Luke helps test the instructions, questions and screen examples. Review the cut, captions and phone readability. The authorised course reviewer approves the lesson and its audience before it goes live. |

Teach one observable task per lesson. Show a worked example, ask the learner to apply it and explain the answer. A still screenshot with matching text steps can teach a fixed screen. A screencast can show movement, timing or a sequence. Pair clips with reviewed captions and a transcript. [Worked examples and retrieval practice](https://ies.ed.gov/ncee/wwc/PracticeGuide/1) · [W3C guidance on accessible media](https://www.w3.org/WAI/media/av/)

## Reuse the four projects

| Project | Piece to adapt |
| --- | --- |
| **Infinity Engine** | Its `brief` command exports a self-contained prompt. The operator can run it in a model of their choice and merge a saved JSON answer after review. Reuse that file-first exchange for course lessons. Keep model and runner choices in settings rather than the lesson format. [Workflow](https://github.com/auraofintelligence/infinity-engine/blob/main/docs/WORKFLOW.md) · [Prompt code](https://github.com/auraofintelligence/infinity-engine/blob/main/engine/analyse.py) |
| **Infinity Creative Workshop** | Reuse the test lab pattern of expected result, observed result and downloadable notes. Check the same lesson steps and questions across model runs and record where human corrections were needed. [Test lab](https://auraofintelligence.github.io/infinity-creative-workshop/test-lab.html) · [Export code](https://github.com/auraofintelligence/infinity-creative-workshop/blob/main/assets/js/site.mjs) |
| **Infinity Content Engine** | Adapt its interactive prompt-builder concept into a few editable lesson fields and a copyable export. Its prototype provides a design reference for keeping the prompt, inputs and stage together. [Prompt-builder reference](https://github.com/auraofintelligence/infinity-content-engine) |
| **DaVinci Resolve Automations** | Reuse the production packet, markers, caption review and export checks. The Minjerribah Screen & Media Network bundle supplies a visual direction for training clips. Use the Resolve controls available on the editing computer. Add Astra actions after testing them there. [Project bundles](https://auraofintelligence.github.io/davinci-resolve-automations/projects.html) · [Resolve and Astra setup](https://auraofintelligence.github.io/davinci-resolve-automations/setup.html) |

The portable unit is the lesson packet. A person can paste the prompts into a hosted chat, local model or CLI and save the reply in the same format. A text-only model can work from observed screen labels, timed notes and transcript. A model with vision can also review sanitised screen captures. The approved lesson and media remain usable after a provider changes.

## Keep the working files simple

| Files | What they carry |
| --- | --- |
| `BRIEF.md` and saved prompts | Outcome, audience, source notes and exact model input. |
| `CAPTURE.md` and media | Observed labels and actions, shot IDs, raw recording, still images, and the editable Resolve project and exports. |
| `LESSON.md` and `QUESTIONS.json` | Steps, screenshot and video references, transcript, practice feedback and practical criteria. Keep scored answer keys with the author or assessor material. |
| `REVIEW.md` | What Luke or another reviewer tested, changes made, unresolved issues, approval and model or provider when known. |

Keep the input, initial model output, observed capture, human corrections and approved output together. Those are the reference examples for better prompts and consistency checks. Reserve some approved examples for testing so the model can be checked on tasks it hasn't seen in the prompt. Use only authorised and sanitised material for any future training set. Keep learner submissions, live member records and restricted raw footage out of it.

## Apply this in ReadySETCO

Use the existing course and version system. Add **Export lesson brief** so an author can take a lesson into any model and **Add lesson media and questions** so the reviewed material has a place to go. The author can assemble and preview the result manually while the process is being tested. Add **Import lesson packet** when the interchange format has settled. Keep the course's approval and access rules with the release.

For the first test, run the [PLFC handover brief](learning/PLFC-HANDOVER-PILOT-BRIEF.md) through two available models. With Luke's help, follow the output against the recorded workflow. Compare exact screen labels, action order, whether the recording instructions were usable, whether the answers match the example, and which changes took the most effort. An approved pilot becomes the first reference for volunteer onboarding and the Noticeboard and Screen & Media pathways.

The [previous platform benchmark](https://github.com/auraofintelligence/ready-set-co-op-trust-hub/blob/e4027410b052e97d4e240f4bd0f8dd276870c0c7/docs/LEARNING-PLATFORM-BEST-PRACTICES.md) remains available for visual and assessment design. Open edX's lesson blocks, Rise's labelled screenshots and Moodle's feedback practices still fit this workflow.
