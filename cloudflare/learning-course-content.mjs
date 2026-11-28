import { LearningRequestError } from './learning.mjs';

export const SCREENSHOT_LIMIT = 1024 * 1024;
export const DRAFT_LIMIT = 160 * 1024;
export const SCREENSHOT_GROUP_LIMIT = 32 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE = new Set(['www.youtube.com','youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com','youtube-nocookie.com']);

const bad = message => { throw new LearningRequestError(400, 'course_fields', message); };
export function fields(data, allowed) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !allowed.includes(key))) {
    bad('The course request contains unexpected fields.');
  }
}

export function text(value, max, label, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    bad(`Enter ${label} in up to ${max} characters.`);
  }
  return value.trim();
}

function videoSource(value) {
  const raw = text(value, 1200, 'a video link');
  let url;
  try { url = new URL(raw); } catch { bad('Enter a valid HTTPS video link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) bad('Enter a valid HTTPS video link.');
  if (YOUTUBE.has(url.hostname)) {
    const parts = url.pathname.split('/').filter(Boolean);
    const video = url.hostname === 'youtu.be' ? (parts.length === 1 ? parts[0] : '')
      : url.pathname === '/watch' ? url.searchParams.get('v') : (['embed','shorts','live'].includes(parts[0]) && parts.length === 2 ? parts[1] : '');
    if (!VIDEO_ID.test(video ?? '')) bad('Enter the link to a single YouTube video.');
    return `https://www.youtube-nocookie.com/embed/${video}`;
  }
  if (!/\.(mp4|webm)$/i.test(url.pathname)) bad('Use a YouTube link or a direct HTTPS link to an MP4 or WebM file.');
  return url.href;
}

function normaliseQuestion(question) {
  fields(question, ['id','type','mode','prompt','choices','correct_choice_id','explanation','source_refs']);
  if (typeof question.id !== 'string' || !ID.test(question.id) || question.type !== 'single_choice' || question.mode !== 'practice') {
    bad('Give each practice question a simple ID and use the single-choice format.');
  }
  if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 4) {
    bad('Add between two and four choices to each practice question.');
  }
  const choices = question.choices.map(choice => {
    fields(choice, ['id','text']);
    if (typeof choice.id !== 'string' || !ID.test(choice.id)) bad('Give each answer choice a simple ID.');
    return { id:choice.id, text:text(choice.text,240,'answer choice text') };
  });
  if (new Set(choices.map(choice => choice.id)).size !== choices.length ||
      !choices.some(choice => choice.id === question.correct_choice_id)) {
    bad('Choose one correct answer and give each answer choice a different ID.');
  }
  const sources = question.source_refs ?? [];
  if (!Array.isArray(sources) || sources.length > 8) bad('Keep up to eight source references per question.');
  return {
    id:question.id, type:'single_choice', mode:'practice', prompt:text(question.prompt, 480, 'a practice question'),
    choices, correct_choice_id:question.correct_choice_id, explanation:text(question.explanation, 650, 'an answer explanation'),
    source_refs:sources.map(source => text(source, 200, 'a question source'))
  };
}

export function draftLesson(lesson) {
  fields(lesson, ['title','body','captureNotes','screenshot','video','questions']);
  const result = { title:text(lesson.title, 140, 'a lesson title'), body:text(lesson.body, 2200, 'the lesson text') };
  if (lesson.captureNotes) result.captureNotes = text(lesson.captureNotes, 2200, 'capture notes');
  if (lesson.screenshot) {
    fields(lesson.screenshot, ['id','alt','caption']);
    if (typeof lesson.screenshot.id !== 'string' || !UUID.test(lesson.screenshot.id)) bad('Add a screenshot from this training group.');
    result.screenshot = {
      id:lesson.screenshot.id, alt:text(lesson.screenshot.alt, 280, 'a text description for the screenshot'),
      caption:text(lesson.screenshot.caption ?? '', 500, 'a screenshot caption', false)
    };
  }
  if (lesson.video) {
    fields(lesson.video, ['url','transcript','captions']);
    const url = videoSource(lesson.video.url);
    const captions = text(lesson.video.captions ?? '', 8000, 'WebVTT captions', false).replace(/\r\n/g, '\n');
    if (captions && (!/^WEBVTT(?:[^\S\n].*)?\n/.test(captions) || !/^\d{2}:\d{2}(?::\d{2})?\.\d{3}[ \t]+-->[ \t]+\d{2}:\d{2}(?::\d{2})?\.\d{3}/m.test(captions))) {
      bad('Use a WebVTT file with a WEBVTT header and timed cues.');
    }
    if (url.startsWith('https://www.youtube-nocookie.com/') && captions) bad('Add a YouTube caption track in YouTube Studio.');
    result.video = { url, transcript:text(lesson.video.transcript, 6000, 'a video transcript'), captions };
  }
  if (lesson.questions !== undefined) {
    if (!Array.isArray(lesson.questions) || lesson.questions.length > 4) bad('Add up to four practice questions to a lesson.');
    const questions = lesson.questions.map(normaliseQuestion);
    if (new Set(questions.map(question => question.id)).size !== questions.length) bad('Each practice question needs a different ID.');
    if (questions.length) result.questions = questions;
  }
  return result;
}

export function learnerCourse(course) {
  const lessons = course.lessons.map((lesson, index) => {
    if (!course.enrolmentId) return { title:lesson.title };
    const done = course.progress.includes(index + 1);
    return {
      title:lesson.title, body:lesson.body,
      ...(lesson.screenshot ? { screenshot:lesson.screenshot } : {}),
      ...(lesson.video ? { video:{ url:lesson.video.url, transcript:lesson.video.transcript,
        ...(lesson.video.captions ? { captionsUrl:`/api/learning/courses/${course.id}/${course.revision}/captions/${index + 1}` } : {}) } } : {}),
      ...(lesson.questions?.length ? { questions:lesson.questions.map(({ id,prompt,choices,correct_choice_id,explanation }) =>
        ({ id,prompt,choices,...(done ? { correct_choice_id,explanation } : {}) })) } : {})
    };
  });
  return { ...course, lessons };
}

export function checkPractice(questions = [], answers) {
  if (!questions.length) return;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) ||
      Object.keys(answers).length !== questions.length ||
      questions.some(question => !Object.hasOwn(answers,question.id) || !question.choices.some(choice => choice.id === answers[question.id]))) {
    bad('Choose an answer for every practice question.');
  }
  const correct = questions.filter(question => question.correct_choice_id === answers[question.id]).length;
  if (correct !== questions.length) {
    throw new LearningRequestError(422, 'course_practice_retry', `${correct} of ${questions.length} correct. Check the lesson and try again.`);
  }
}

function rasterType(bytes) {
  const has = (signature, offset = 0) => bytes.length >= offset + signature.length &&
    signature.every((value, index) => bytes[offset + index] === value);
  if (has([137,80,78,71,13,10,26,10]) && has([73,72,68,82],12)) return 'image/png';
  if (has([255,216,255]) && has([255,217],bytes.length - 2)) return 'image/jpeg';
  if (has([82,73,70,70]) && has([87,69,66,80],8) && has([86,80,56],12)) return 'image/webp';
  return '';
}

export async function readScreenshot(request) {
  const mime = request.headers.get('Content-Type');
  if (!['image/png','image/jpeg','image/webp'].includes(mime)) {
    throw new LearningRequestError(415, 'course_screenshot_type', 'Choose a PNG, JPEG or WebP screenshot.');
  }
  const lengthError = () => { throw new LearningRequestError(413, 'course_screenshot_size', 'Choose a screenshot of 1 MiB or less.'); };
  if (Number(request.headers.get('Content-Length') ?? 0) > SCREENSHOT_LIMIT) lengthError();
  if (!request.body) bad('Choose a screenshot first.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value,done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SCREENSHOT_LIMIT) { await reader.cancel(); lengthError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  if (rasterType(bytes) !== mime) throw new LearningRequestError(415, 'course_screenshot_type', 'The file contents do not match the screenshot format.');
  const sha = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  let binary = '';
  for (let i = 0; i < size; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return { mime, size, digest:[...sha].map(n => n.toString(16).padStart(2,'0')).join(''), base64:btoa(binary) };
}
