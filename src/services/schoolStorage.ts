import {
  SCHOOL_CLASSES,
  SchoolClassId,
  SchoolClassSettings,
  SchoolLesson,
  SchoolLessonTombstone,
} from '../schoolTypes';

const DB_NAME = 'memomemo_school_db';
const DB_VERSION = 1;
const LESSON_STORE = 'lessons';
const SETTINGS_STORE = 'classSettings';
const LESSONS_FALLBACK_KEY = 'memomemo_school_lessons_v1';
const SETTINGS_FALLBACK_KEY = 'memomemo_school_settings_v1';
const TOMBSTONES_KEY = 'memomemo_school_tombstones_v1';

function isSchoolClassId(value: unknown): value is SchoolClassId {
  return typeof value === 'string' && (SCHOOL_CLASSES as readonly string[]).includes(value);
}

function validVersion(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

export function normalizeSchoolLesson(value: unknown): SchoolLesson | null {
  if (!value || typeof value !== 'object') return null;
  const lesson = value as Record<string, unknown>;
  if (
    typeof lesson.id !== 'string' || !lesson.id ||
    !isSchoolClassId(lesson.classId) ||
    typeof lesson.lessonDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(lesson.lessonDate) ||
    typeof lesson.lessonContent !== 'string' ||
    typeof lesson.lessonFlow !== 'string' ||
    typeof lesson.handouts !== 'string' ||
    typeof lesson.openingQuiz !== 'string' ||
    typeof lesson.nextLesson !== 'string' ||
    typeof lesson.examScopeSnapshot !== 'string' ||
    typeof lesson.completed !== 'boolean' ||
    typeof lesson.createdAt !== 'number' || !Number.isFinite(lesson.createdAt) ||
    typeof lesson.updatedAt !== 'number' || !Number.isFinite(lesson.updatedAt)
  ) return null;

  return {
    id: lesson.id,
    classId: lesson.classId,
    lessonDate: lesson.lessonDate,
    lessonContent: lesson.lessonContent,
    lessonFlow: lesson.lessonFlow,
    handouts: lesson.handouts,
    openingQuiz: lesson.openingQuiz,
    nextLesson: lesson.nextLesson,
    examScopeSnapshot: lesson.examScopeSnapshot,
    completed: lesson.completed,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
    version: validVersion(lesson.version),
  };
}

export function normalizeSchoolClassSettings(value: unknown): SchoolClassSettings | null {
  if (!value || typeof value !== 'object') return null;
  const settings = value as Record<string, unknown>;
  if (
    !isSchoolClassId(settings.classId) ||
    typeof settings.examScope !== 'string' ||
    typeof settings.updatedAt !== 'number' || !Number.isFinite(settings.updatedAt)
  ) return null;

  return {
    classId: settings.classId,
    examScope: settings.examScope,
    updatedAt: settings.updatedAt,
    version: validVersion(settings.version),
  };
}

function normalizeTombstone(value: unknown): SchoolLessonTombstone | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.lessonId !== 'string' || !item.lessonId ||
    typeof item.deletedAt !== 'number' || !Number.isFinite(item.deletedAt) ||
    typeof item.version !== 'number' || !Number.isInteger(item.version) || item.version < 1
  ) return null;
  return { lessonId: item.lessonId, deletedAt: item.deletedAt, version: item.version };
}

function sortLessons(lessons: SchoolLesson[]): SchoolLesson[] {
  return [...lessons].sort((a, b) => {
    if (a.lessonDate !== b.lessonDate) return b.lessonDate.localeCompare(a.lessonDate);
    return b.updatedAt - a.updatedAt;
  });
}

function readJson<T>(key: string, parser: (value: unknown) => T | null): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parser).filter((value): value is T => value !== null);
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, values: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch (err) {
    console.warn(`Failed to save ${key}`, err);
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LESSON_STORE)) {
        db.createObjectStore(LESSON_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'classId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSchoolLessons(): Promise<SchoolLesson[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(LESSON_STORE, 'readonly');
      const request = tx.objectStore(LESSON_STORE).getAll();
      request.onsuccess = () => {
        const values = Array.isArray(request.result)
          ? request.result.map(normalizeSchoolLesson).filter((value): value is SchoolLesson => value !== null)
          : [];
        resolve(sortLessons(values));
      };
      request.onerror = () => resolve(sortLessons(readJson(LESSONS_FALLBACK_KEY, normalizeSchoolLesson)));
    });
  } catch {
    return sortLessons(readJson(LESSONS_FALLBACK_KEY, normalizeSchoolLesson));
  }
}

export async function saveSchoolLesson(lesson: SchoolLesson): Promise<void> {
  const normalized = normalizeSchoolLesson(lesson);
  if (!normalized) throw new Error('授業メモの形式が正しくありません。');
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LESSON_STORE, 'readwrite');
      tx.objectStore(LESSON_STORE).put(normalized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School lesson transaction aborted'));
    });
  } catch {
    const current = readJson(LESSONS_FALLBACK_KEY, normalizeSchoolLesson).filter((item) => item.id !== normalized.id);
    writeJson(LESSONS_FALLBACK_KEY, [normalized, ...current]);
  }
}

export async function saveAllSchoolLessons(lessons: SchoolLesson[]): Promise<void> {
  const normalized = lessons
    .map(normalizeSchoolLesson)
    .filter((value): value is SchoolLesson => value !== null);
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LESSON_STORE, 'readwrite');
      const store = tx.objectStore(LESSON_STORE);
      store.clear();
      for (const lesson of normalized) store.put(lesson);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School lesson bulk transaction aborted'));
    });
  } catch {
    writeJson(LESSONS_FALLBACK_KEY, normalized);
  }
}

export async function deleteSchoolLesson(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LESSON_STORE, 'readwrite');
      tx.objectStore(LESSON_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School lesson delete aborted'));
    });
  } catch {
    const current = readJson(LESSONS_FALLBACK_KEY, normalizeSchoolLesson).filter((item) => item.id !== id);
    writeJson(LESSONS_FALLBACK_KEY, current);
  }
}

export async function getSchoolClassSettings(): Promise<SchoolClassSettings[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const request = tx.objectStore(SETTINGS_STORE).getAll();
      request.onsuccess = () => {
        const values = Array.isArray(request.result)
          ? request.result.map(normalizeSchoolClassSettings).filter((value): value is SchoolClassSettings => value !== null)
          : [];
        resolve(values);
      };
      request.onerror = () => resolve(readJson(SETTINGS_FALLBACK_KEY, normalizeSchoolClassSettings));
    });
  } catch {
    return readJson(SETTINGS_FALLBACK_KEY, normalizeSchoolClassSettings);
  }
}

export async function saveSchoolClassSettings(settings: SchoolClassSettings): Promise<void> {
  const normalized = normalizeSchoolClassSettings(settings);
  if (!normalized) throw new Error('試験範囲の形式が正しくありません。');
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).put(normalized);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School settings transaction aborted'));
    });
  } catch {
    const current = readJson(SETTINGS_FALLBACK_KEY, normalizeSchoolClassSettings).filter((item) => item.classId !== normalized.classId);
    writeJson(SETTINGS_FALLBACK_KEY, [normalized, ...current]);
  }
}

export async function saveAllSchoolClassSettings(settings: SchoolClassSettings[]): Promise<void> {
  const normalized = settings
    .map(normalizeSchoolClassSettings)
    .filter((value): value is SchoolClassSettings => value !== null);
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      const store = tx.objectStore(SETTINGS_STORE);
      store.clear();
      for (const item of normalized) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School settings bulk transaction aborted'));
    });
  } catch {
    writeJson(SETTINGS_FALLBACK_KEY, normalized);
  }
}

export function loadSchoolLessonTombstones(): SchoolLessonTombstone[] {
  return readJson(TOMBSTONES_KEY, normalizeTombstone);
}

export function saveSchoolLessonTombstones(tombstones: SchoolLessonTombstone[]): void {
  const newest = new Map<string, SchoolLessonTombstone>();
  for (const tombstone of tombstones) {
    const normalized = normalizeTombstone(tombstone);
    if (!normalized) continue;
    const current = newest.get(normalized.lessonId);
    if (
      !current ||
      normalized.version > current.version ||
      (normalized.version === current.version && normalized.deletedAt > current.deletedAt)
    ) {
      newest.set(normalized.lessonId, normalized);
    }
  }
  writeJson(TOMBSTONES_KEY, Array.from(newest.values()));
}

export function recordSchoolLessonDeletion(lesson: SchoolLesson): SchoolLessonTombstone {
  const tombstone: SchoolLessonTombstone = {
    lessonId: lesson.id,
    deletedAt: Date.now(),
    version: Math.max(1, (lesson.version || 1) + 1),
  };
  saveSchoolLessonTombstones([...loadSchoolLessonTombstones(), tombstone]);
  return tombstone;
}

export function mergeSchoolLessonTombstones(remote: SchoolLessonTombstone[]): SchoolLessonTombstone[] {
  const combined = [...loadSchoolLessonTombstones(), ...remote];
  saveSchoolLessonTombstones(combined);
  return loadSchoolLessonTombstones();
}
