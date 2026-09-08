import { SCHOOL_CLASSES, SchoolClassId, SchoolClassSettings, SchoolLesson } from '../schoolTypes';
import { Note } from '../types';
import {
  deleteNote as deleteNoteStorage,
  getAllNotes,
  getCloudflareConfig,
  saveAllNotes,
  saveNote,
} from './storage';
import { mergeNotesWithCloudState, syncWithCloudflare } from './cloudflareSync';
import { recordNoteDeletion } from './cloudVault';

// Legacy school-only storage is retained only for one-time migration from the first
// implementation. Current school data lives as hidden Note records so it benefits
// from the same encrypted Cloudflare sync and conflict resolution as normal memos.
const LEGACY_DB_NAME = 'memomemo_school_db';
const LEGACY_DB_VERSION = 1;
const LEGACY_LESSON_STORE = 'lessons';
const LEGACY_SETTINGS_STORE = 'classSettings';
const LEGACY_LESSONS_FALLBACK_KEY = 'memomemo_school_lessons_v1';
const LEGACY_SETTINGS_FALLBACK_KEY = 'memomemo_school_settings_v1';
const MIGRATION_KEY = 'memomemo_school_notes_migrated_v1';

const SCHOOL_LESSON_NOTE_PREFIX = '__memomemo_school_lesson__:';
const SCHOOL_SETTINGS_NOTE_PREFIX = '__memomemo_school_settings__:';
const SCHOOL_SYNC_SCHEMA = 'memomemo-school-sync-v1';

type SchoolSystemEnvelope =
  | { schema: typeof SCHOOL_SYNC_SCHEMA; type: 'lesson'; value: SchoolLesson }
  | { schema: typeof SCHOOL_SYNC_SCHEMA; type: 'settings'; value: SchoolClassSettings };

let migrationPromise: Promise<void> | null = null;
let syncTimer: number | null = null;

export function isSchoolSystemNote(note: Pick<Note, 'id'>): boolean {
  return (
    note.id.startsWith(SCHOOL_LESSON_NOTE_PREFIX) ||
    note.id.startsWith(SCHOOL_SETTINGS_NOTE_PREFIX)
  );
}

function isSchoolClassId(value: unknown): value is SchoolClassId {
  return typeof value === 'string' && (SCHOOL_CLASSES as readonly string[]).includes(value);
}

function isSchoolLesson(value: unknown): value is SchoolLesson {
  if (!value || typeof value !== 'object') return false;
  const lesson = value as Record<string, unknown>;
  return (
    typeof lesson.id === 'string' && lesson.id.length > 0 &&
    isSchoolClassId(lesson.classId) &&
    typeof lesson.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lesson.lessonDate) &&
    Number.isFinite(new Date(`${lesson.lessonDate}T00:00:00`).getTime()) &&
    typeof lesson.lessonContent === 'string' &&
    typeof lesson.lessonFlow === 'string' &&
    typeof lesson.handouts === 'string' &&
    typeof lesson.openingQuiz === 'string' &&
    typeof lesson.nextLesson === 'string' &&
    typeof lesson.examScopeSnapshot === 'string' &&
    typeof lesson.completed === 'boolean' &&
    typeof lesson.createdAt === 'number' && Number.isFinite(lesson.createdAt) &&
    typeof lesson.updatedAt === 'number' && Number.isFinite(lesson.updatedAt)
  );
}

function isClassSettings(value: unknown): value is SchoolClassSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    isSchoolClassId(settings.classId) &&
    typeof settings.examScope === 'string' &&
    typeof settings.updatedAt === 'number' && Number.isFinite(settings.updatedAt)
  );
}

function sortLessons(lessons: SchoolLesson[]): SchoolLesson[] {
  return [...lessons].sort((a, b) => {
    if (a.lessonDate !== b.lessonDate) return b.lessonDate.localeCompare(a.lessonDate);
    return b.updatedAt - a.updatedAt;
  });
}

function readJson<T>(key: string, validator: (value: unknown) => value is T): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validator);
  } catch {
    return [];
  }
}

function openLegacyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_LESSON_STORE)) {
        db.createObjectStore(LEGACY_LESSON_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LEGACY_SETTINGS_STORE)) {
        db.createObjectStore(LEGACY_SETTINGS_STORE, { keyPath: 'classId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getLegacyLessons(): Promise<SchoolLesson[]> {
  try {
    const db = await openLegacyDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LEGACY_LESSON_STORE, 'readonly');
      const request = tx.objectStore(LEGACY_LESSON_STORE).getAll();
      request.onsuccess = () => {
        const result = Array.isArray(request.result) ? request.result.filter(isSchoolLesson) : [];
        resolve(sortLessons(result));
      };
      request.onerror = () => resolve(sortLessons(readJson(LEGACY_LESSONS_FALLBACK_KEY, isSchoolLesson)));
    });
  } catch {
    return sortLessons(readJson(LEGACY_LESSONS_FALLBACK_KEY, isSchoolLesson));
  }
}

async function getLegacySettings(): Promise<SchoolClassSettings[]> {
  try {
    const db = await openLegacyDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LEGACY_SETTINGS_STORE, 'readonly');
      const request = tx.objectStore(LEGACY_SETTINGS_STORE).getAll();
      request.onsuccess = () => {
        resolve(Array.isArray(request.result) ? request.result.filter(isClassSettings) : []);
      };
      request.onerror = () => resolve(readJson(LEGACY_SETTINGS_FALLBACK_KEY, isClassSettings));
    });
  } catch {
    return readJson(LEGACY_SETTINGS_FALLBACK_KEY, isClassSettings);
  }
}

function parseEnvelope(note: Note): SchoolSystemEnvelope | null {
  if (!isSchoolSystemNote(note)) return null;
  try {
    const parsed: unknown = JSON.parse(note.content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const envelope = parsed as Record<string, unknown>;
    if (envelope.schema !== SCHOOL_SYNC_SCHEMA) return null;
    if (envelope.type === 'lesson' && isSchoolLesson(envelope.value)) {
      return { schema: SCHOOL_SYNC_SCHEMA, type: 'lesson', value: envelope.value };
    }
    if (envelope.type === 'settings' && isClassSettings(envelope.value)) {
      return { schema: SCHOOL_SYNC_SCHEMA, type: 'settings', value: envelope.value };
    }
    return null;
  } catch {
    return null;
  }
}

function lessonSystemId(lessonId: string): string {
  return `${SCHOOL_LESSON_NOTE_PREFIX}${lessonId}`;
}

function settingsSystemId(classId: SchoolClassId): string {
  return `${SCHOOL_SETTINGS_NOTE_PREFIX}${classId}`;
}

function makeLessonSystemNote(lesson: SchoolLesson, existing?: Note): Note {
  const envelope: SchoolSystemEnvelope = { schema: SCHOOL_SYNC_SCHEMA, type: 'lesson', value: lesson };
  return {
    id: lessonSystemId(lesson.id),
    title: `学校メモ ${lesson.classId} ${lesson.lessonDate}`,
    content: JSON.stringify(envelope),
    tags: [],
    tasks: [],
    attachments: [],
    isPinned: false,
    createdAt: existing?.createdAt ?? lesson.createdAt,
    updatedAt: lesson.updatedAt,
    version: existing ? Math.max(1, existing.version + 1) : 1,
  };
}

function makeSettingsSystemNote(settings: SchoolClassSettings, existing?: Note): Note {
  const envelope: SchoolSystemEnvelope = { schema: SCHOOL_SYNC_SCHEMA, type: 'settings', value: settings };
  return {
    id: settingsSystemId(settings.classId),
    title: `学校設定 ${settings.classId}`,
    content: JSON.stringify(envelope),
    tags: [],
    tasks: [],
    attachments: [],
    isPinned: false,
    createdAt: existing?.createdAt ?? settings.updatedAt,
    updatedAt: settings.updatedAt,
    version: existing ? Math.max(1, existing.version + 1) : 1,
  };
}

async function ensureLegacyMigration(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(MIGRATION_KEY) === '1') return;
  } catch {
    // IndexedDB migration can still proceed when localStorage is unavailable.
  }

  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const [legacyLessons, legacySettings, notes] = await Promise.all([
      getLegacyLessons(),
      getLegacySettings(),
      getAllNotes(),
    ]);
    const byId = new Map(notes.map((note) => [note.id, note]));

    for (const lesson of legacyLessons) {
      const id = lessonSystemId(lesson.id);
      const existing = byId.get(id);
      const existingEnvelope = existing ? parseEnvelope(existing) : null;
      if (
        existingEnvelope?.type === 'lesson' &&
        existingEnvelope.value.updatedAt >= lesson.updatedAt
      ) {
        continue;
      }
      const systemNote = makeLessonSystemNote(lesson, existing);
      await saveNote(systemNote);
      byId.set(id, systemNote);
    }

    for (const settings of legacySettings) {
      const id = settingsSystemId(settings.classId);
      const existing = byId.get(id);
      const existingEnvelope = existing ? parseEnvelope(existing) : null;
      if (
        existingEnvelope?.type === 'settings' &&
        existingEnvelope.value.updatedAt >= settings.updatedAt
      ) {
        continue;
      }
      const systemNote = makeSettingsSystemNote(settings, existing);
      await saveNote(systemNote);
      byId.set(id, systemNote);
    }

    try {
      localStorage.setItem(MIGRATION_KEY, '1');
    } catch {
      // A failed marker only means migration may be retried; freshness checks keep it idempotent.
    }

    if (legacyLessons.length || legacySettings.length) scheduleSchoolCloudSync();
  })().finally(() => {
    migrationPromise = null;
  });

  return migrationPromise;
}

async function syncSchoolDataToCloud(): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!navigator.onLine) return;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

  const config = getCloudflareConfig();
  if (!config.autoSync || !config.syncCode || !config.workerUrl.trim()) return;

  try {
    const localNotes = await getAllNotes();
    const result = await syncWithCloudflare(localNotes, config);
    if (!result.success || !result.remoteNotes) return;
    const merged = mergeNotesWithCloudState(
      localNotes,
      result.remoteNotes,
      result.remoteTombstones || []
    );
    await saveAllNotes(merged);
  } catch (err) {
    // Local save is authoritative. Cloud sync can retry on the next app/open/edit cycle.
    console.warn('School memo cloud sync failed; local data remains saved.', err);
  }
}

function scheduleSchoolCloudSync(): void {
  if (typeof window === 'undefined') return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncSchoolDataToCloud();
  }, 1200);
}

export async function getSchoolLessons(): Promise<SchoolLesson[]> {
  await ensureLegacyMigration();
  const notes = await getAllNotes();
  const lessons = notes.flatMap((note) => {
    const envelope = parseEnvelope(note);
    return envelope?.type === 'lesson' ? [envelope.value] : [];
  });
  return sortLessons(lessons);
}

export async function saveSchoolLesson(lesson: SchoolLesson): Promise<void> {
  if (!isSchoolLesson(lesson)) throw new Error('授業メモの形式が正しくありません。');
  await ensureLegacyMigration();
  const notes = await getAllNotes();
  const existing = notes.find((note) => note.id === lessonSystemId(lesson.id));
  await saveNote(makeLessonSystemNote(lesson, existing));
  scheduleSchoolCloudSync();
}

export async function deleteSchoolLesson(id: string): Promise<void> {
  await ensureLegacyMigration();
  const systemId = lessonSystemId(id);
  const notes = await getAllNotes();
  const existing = notes.find((note) => note.id === systemId);
  if (existing) {
    recordNoteDeletion(existing);
    await deleteNoteStorage(systemId);
  }
  scheduleSchoolCloudSync();
}

export async function getSchoolClassSettings(): Promise<SchoolClassSettings[]> {
  await ensureLegacyMigration();
  const notes = await getAllNotes();
  return notes.flatMap((note) => {
    const envelope = parseEnvelope(note);
    return envelope?.type === 'settings' ? [envelope.value] : [];
  });
}

export async function saveSchoolClassSettings(settings: SchoolClassSettings): Promise<void> {
  if (!isClassSettings(settings)) throw new Error('試験範囲の形式が正しくありません。');
  await ensureLegacyMigration();
  const notes = await getAllNotes();
  const existing = notes.find((note) => note.id === settingsSystemId(settings.classId));
  await saveNote(makeSettingsSystemNote(settings, existing));
  scheduleSchoolCloudSync();
}
