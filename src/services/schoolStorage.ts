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

/**
 * School records are stored as valid, hidden Note records.
 * This lets them reuse MEMOMEMO's existing AES-GCM Cloudflare vault,
 * conflict resolution, offline storage and tombstone deletion semantics.
 */
const LESSON_NOTE_PREFIX = '__memomemo_school_lesson__:';
const SETTINGS_NOTE_PREFIX = '__memomemo_school_settings__:';
const SCHOOL_SYNC_SCHEMA = 'memomemo-school-sync-v1';

// Legacy school-only DB/localStorage keys. These are read once and migrated so
// existing lesson data from the first school-memo implementation is preserved.
const LEGACY_DB_NAME = 'memomemo_school_db';
const LEGACY_DB_VERSION = 1;
const LEGACY_LESSON_STORE = 'lessons';
const LEGACY_SETTINGS_STORE = 'classSettings';
const LEGACY_LESSONS_FALLBACK_KEY = 'memomemo_school_lessons_v1';
const LEGACY_SETTINGS_FALLBACK_KEY = 'memomemo_school_settings_v1';
const MIGRATION_KEY = 'memomemo_school_notes_migrated_v1';

type SchoolEnvelope =
  | { schema: typeof SCHOOL_SYNC_SCHEMA; type: 'lesson'; value: SchoolLesson }
  | { schema: typeof SCHOOL_SYNC_SCHEMA; type: 'settings'; value: SchoolClassSettings };

let migrationPromise: Promise<void> | null = null;
let syncTimer: number | null = null;
let lastCloudPullAt = 0;

export function isSchoolSystemNote(note: Pick<Note, 'id'>): boolean {
  return note.id.startsWith(LESSON_NOTE_PREFIX) || note.id.startsWith(SETTINGS_NOTE_PREFIX);
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

function readLegacyJson<T>(key: string, validator: (value: unknown) => value is T): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(validator) : [];
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

async function readLegacyStore<T>(storeName: string, fallbackKey: string, validator: (value: unknown) => value is T): Promise<T[]> {
  try {
    const db = await openLegacyDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.filter(validator) : []);
      request.onerror = () => resolve(readLegacyJson(fallbackKey, validator));
    });
  } catch {
    return readLegacyJson(fallbackKey, validator);
  }
}

function parseEnvelope(note: Note): SchoolEnvelope | null {
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
  } catch {
    // Ignore malformed internal records rather than exposing them to the school UI.
  }
  return null;
}

function lessonSystemId(lessonId: string): string {
  return `${LESSON_NOTE_PREFIX}${lessonId}`;
}

function settingsSystemId(classId: SchoolClassId): string {
  return `${SETTINGS_NOTE_PREFIX}${classId}`;
}

function makeLessonNote(lesson: SchoolLesson, existing?: Note): Note {
  const envelope: SchoolEnvelope = { schema: SCHOOL_SYNC_SCHEMA, type: 'lesson', value: lesson };
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
    version: existing ? Math.max(1, (existing.version || 1) + 1) : 1,
  };
}

function makeSettingsNote(settings: SchoolClassSettings, existing?: Note): Note {
  const envelope: SchoolEnvelope = { schema: SCHOOL_SYNC_SCHEMA, type: 'settings', value: settings };
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
    version: existing ? Math.max(1, (existing.version || 1) + 1) : 1,
  };
}

async function ensureLegacyMigration(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(MIGRATION_KEY) === '1') return;
  } catch {
    // Continue; IndexedDB may still be available.
  }

  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    const [legacyLessons, legacySettings, currentNotes] = await Promise.all([
      readLegacyStore(LEGACY_LESSON_STORE, LEGACY_LESSONS_FALLBACK_KEY, isSchoolLesson),
      readLegacyStore(LEGACY_SETTINGS_STORE, LEGACY_SETTINGS_FALLBACK_KEY, isClassSettings),
      getAllNotes(),
    ]);
    const byId = new Map(currentNotes.map((note) => [note.id, note]));

    for (const lesson of legacyLessons) {
      const id = lessonSystemId(lesson.id);
      const existing = byId.get(id);
      const old = existing ? parseEnvelope(existing) : null;
      if (old?.type === 'lesson' && old.value.updatedAt >= lesson.updatedAt) continue;
      const next = makeLessonNote(lesson, existing);
      await saveNote(next);
      byId.set(id, next);
    }

    for (const settings of legacySettings) {
      const id = settingsSystemId(settings.classId);
      const existing = byId.get(id);
      const old = existing ? parseEnvelope(existing) : null;
      if (old?.type === 'settings' && old.value.updatedAt >= settings.updatedAt) continue;
      const next = makeSettingsNote(settings, existing);
      await saveNote(next);
      byId.set(id, next);
    }

    try {
      localStorage.setItem(MIGRATION_KEY, '1');
    } catch {
      // Retrying the idempotent migration is safe.
    }

    if (legacyLessons.length > 0 || legacySettings.length > 0) scheduleCloudSync();
  })().finally(() => {
    migrationPromise = null;
  });

  return migrationPromise;
}

function canUseCloudSync(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.onLine) return false;
  // Browser QA/dev must remain deterministic and must not call a production sync endpoint.
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return false;
  const config = getCloudflareConfig();
  return Boolean(config.autoSync && config.syncCode && config.workerUrl.trim());
}

async function syncSchoolNotesWithCloud(): Promise<void> {
  if (!canUseCloudSync()) return;
  const config = getCloudflareConfig();
  try {
    const localNotes = await getAllNotes();
    const result = await syncWithCloudflare(localNotes, config);
    if (!result.success || !result.remoteNotes) return;
    const merged = mergeNotesWithCloudState(localNotes, result.remoteNotes, result.remoteTombstones || []);
    await saveAllNotes(merged);
    lastCloudPullAt = Date.now();
  } catch (err) {
    // Local persistence is authoritative; the next edit/open will retry cloud sync.
    console.warn('School memo cloud sync failed; local data is still saved.', err);
  }
}

function scheduleCloudSync(): void {
  if (typeof window === 'undefined') return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    void syncSchoolNotesWithCloud();
  }, 1200);
}

async function refreshFromCloudIfNeeded(): Promise<void> {
  if (!canUseCloudSync()) return;
  if (Date.now() - lastCloudPullAt < 30_000) return;
  await syncSchoolNotesWithCloud();
}

export async function getSchoolLessons(): Promise<SchoolLesson[]> {
  await ensureLegacyMigration();
  await refreshFromCloudIfNeeded();
  const notes = await getAllNotes();
  return sortLessons(
    notes.flatMap((note) => {
      const envelope = parseEnvelope(note);
      return envelope?.type === 'lesson' ? [envelope.value] : [];
    })
  );
}

export async function saveSchoolLesson(lesson: SchoolLesson): Promise<void> {
  if (!isSchoolLesson(lesson)) throw new Error('授業メモの形式が正しくありません。');
  await ensureLegacyMigration();
  const notes = await getAllNotes();
  const existing = notes.find((note) => note.id === lessonSystemId(lesson.id));
  await saveNote(makeLessonNote(lesson, existing));
  scheduleCloudSync();
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
  scheduleCloudSync();
}

export async function getSchoolClassSettings(): Promise<SchoolClassSettings[]> {
  await ensureLegacyMigration();
  await refreshFromCloudIfNeeded();
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
  await saveNote(makeSettingsNote(settings, existing));
  scheduleCloudSync();
}
