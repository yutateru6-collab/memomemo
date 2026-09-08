import { SCHOOL_CLASSES, SchoolClassId, SchoolClassSettings, SchoolLesson } from '../schoolTypes';

const DB_NAME = 'memomemo_school_db';
const DB_VERSION = 1;
const LESSON_STORE = 'lessons';
const SETTINGS_STORE = 'classSettings';
const LESSONS_FALLBACK_KEY = 'memomemo_school_lessons_v1';
const SETTINGS_FALLBACK_KEY = 'memomemo_school_settings_v1';

function isSchoolClassId(value: unknown): value is SchoolClassId {
  return typeof value === 'string' && (SCHOOL_CLASSES as readonly string[]).includes(value);
}

function isSchoolLesson(value: unknown): value is SchoolLesson {
  if (!value || typeof value !== 'object') return false;
  const lesson = value as Record<string, unknown>;
  return (
    typeof lesson.id === 'string' &&
    isSchoolClassId(lesson.classId) &&
    typeof lesson.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lesson.lessonDate) &&
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

function writeJson<T>(key: string, values: T[]): void {
  localStorage.setItem(key, JSON.stringify(values));
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
        const result = Array.isArray(request.result) ? request.result.filter(isSchoolLesson) : [];
        resolve(sortLessons(result));
      };
      request.onerror = () => resolve(sortLessons(readJson(LESSONS_FALLBACK_KEY, isSchoolLesson)));
    });
  } catch {
    return sortLessons(readJson(LESSONS_FALLBACK_KEY, isSchoolLesson));
  }
}

export async function saveSchoolLesson(lesson: SchoolLesson): Promise<void> {
  if (!isSchoolLesson(lesson)) throw new Error('授業メモの形式が正しくありません。');
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LESSON_STORE, 'readwrite');
      tx.objectStore(LESSON_STORE).put(lesson);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School lesson transaction aborted'));
    });
  } catch {
    const current = readJson(LESSONS_FALLBACK_KEY, isSchoolLesson).filter((item) => item.id !== lesson.id);
    writeJson(LESSONS_FALLBACK_KEY, [lesson, ...current]);
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
    const current = readJson(LESSONS_FALLBACK_KEY, isSchoolLesson).filter((item) => item.id !== id);
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
        resolve(Array.isArray(request.result) ? request.result.filter(isClassSettings) : []);
      };
      request.onerror = () => resolve(readJson(SETTINGS_FALLBACK_KEY, isClassSettings));
    });
  } catch {
    return readJson(SETTINGS_FALLBACK_KEY, isClassSettings);
  }
}

export async function saveSchoolClassSettings(settings: SchoolClassSettings): Promise<void> {
  if (!isClassSettings(settings)) throw new Error('試験範囲の形式が正しくありません。');
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).put(settings);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('School settings transaction aborted'));
    });
  } catch {
    const current = readJson(SETTINGS_FALLBACK_KEY, isClassSettings).filter((item) => item.classId !== settings.classId);
    writeJson(SETTINGS_FALLBACK_KEY, [settings, ...current]);
  }
}
