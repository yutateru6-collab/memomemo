import { Note } from '../types';

export type SchoolClassId = '2-3' | '2-9' | '2-13';

export interface SchoolLessonFields {
  classId: SchoolClassId;
  lessonDate: string; // YYYY-MM-DD
  lessonContent: string;
  lessonFlow: string;
  handouts: string;
  openingQuiz: string;
  nextLesson: string;
  examScope: string;
  completed: boolean;
}

export interface SchoolLessonRecord extends SchoolLessonFields {
  note: Note;
}

const SCHOOL_NOTE_PREFIX = 'school-lesson-';
const SCHOOL_PAYLOAD_VERSION = 1;

interface StoredSchoolLessonPayload extends SchoolLessonFields {
  schema: 'memomemo-school-lesson';
  schemaVersion: number;
}

export const SCHOOL_CLASSES: SchoolClassId[] = ['2-3', '2-9', '2-13'];

export function isSchoolLessonNote(note: Note): boolean {
  return note.id.startsWith(SCHOOL_NOTE_PREFIX);
}

function isSchoolClassId(value: unknown): value is SchoolClassId {
  return value === '2-3' || value === '2-9' || value === '2-13';
}

function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00`).getTime());
}

export function parseSchoolLessonNote(note: Note): SchoolLessonRecord | null {
  if (!isSchoolLessonNote(note)) return null;
  try {
    const raw: unknown = JSON.parse(note.content || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const payload = raw as Partial<StoredSchoolLessonPayload>;
    if (payload.schema !== 'memomemo-school-lesson') return null;
    if (payload.schemaVersion !== SCHOOL_PAYLOAD_VERSION) return null;
    if (!isSchoolClassId(payload.classId) || !isIsoDay(payload.lessonDate)) return null;

    const stringFields: Array<keyof Pick<SchoolLessonFields, 'lessonContent' | 'lessonFlow' | 'handouts' | 'openingQuiz' | 'nextLesson' | 'examScope'>> = [
      'lessonContent',
      'lessonFlow',
      'handouts',
      'openingQuiz',
      'nextLesson',
      'examScope',
    ];
    if (stringFields.some((field) => typeof payload[field] !== 'string')) return null;
    if (typeof payload.completed !== 'boolean') return null;

    return {
      note,
      classId: payload.classId,
      lessonDate: payload.lessonDate,
      lessonContent: payload.lessonContent as string,
      lessonFlow: payload.lessonFlow as string,
      handouts: payload.handouts as string,
      openingQuiz: payload.openingQuiz as string,
      nextLesson: payload.nextLesson as string,
      examScope: payload.examScope as string,
      completed: payload.completed,
    };
  } catch {
    return null;
  }
}

export function serializeSchoolLesson(fields: SchoolLessonFields): string {
  const payload: StoredSchoolLessonPayload = {
    schema: 'memomemo-school-lesson',
    schemaVersion: SCHOOL_PAYLOAD_VERSION,
    ...fields,
  };
  return JSON.stringify(payload);
}

function formatTitleDate(day: string): string {
  const [year, month, date] = day.split('-');
  return `${Number(month)}/${Number(date)}` + (year ? '' : '');
}

export function createSchoolLessonNote(fields: SchoolLessonFields): Note {
  const now = Date.now();
  return {
    id: `${SCHOOL_NOTE_PREFIX}${fields.classId}-${fields.lessonDate}-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: `🏫 ${fields.classId} 授業メモ ${formatTitleDate(fields.lessonDate)}`,
    content: serializeSchoolLesson(fields),
    tags: [],
    tasks: [],
    attachments: [],
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export function updateSchoolLessonNote(note: Note, fields: SchoolLessonFields): Note {
  return {
    ...note,
    title: `🏫 ${fields.classId} 授業メモ ${formatTitleDate(fields.lessonDate)}`,
    content: serializeSchoolLesson(fields),
    updatedAt: Date.now(),
    version: Math.max(1, (note.version || 1) + 1),
  };
}

export function getSchoolLessons(notes: Note[]): SchoolLessonRecord[] {
  return notes
    .map(parseSchoolLessonNote)
    .filter((item): item is SchoolLessonRecord => item !== null)
    .sort((a, b) => {
      if (a.lessonDate !== b.lessonDate) return b.lessonDate.localeCompare(a.lessonDate);
      return b.note.updatedAt - a.note.updatedAt;
    });
}

export function todayIsoDay(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
