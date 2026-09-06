import { Note, CloudflareSyncConfig } from '../types';
import { toDateTimeLocalValue } from './dateTime';
import { parseNotesArray, salvageNotesArray, sortNotesForDisplay } from './noteValidation';
import { generateSyncCode, recordNoteDeletion } from './cloudVault';
import { filterRetiredSampleNotes, isRetiredSampleNoteId } from './retiredSamples';

const DB_NAME = 'ios_notes_db';
const DB_VERSION = 1;
const STORE_NAME = 'notes';
const INITIALIZED_KEY = 'ios_notes_initialized_v1';

// Open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Initial sample notes showcasing features
function migrateRetiredSampleNotes(notes: Note[]): Note[] {
  const retired = notes.filter((note) => isRetiredSampleNoteId(note.id));
  if (retired.length === 0) return notes;

  for (const note of retired) recordNoteDeletion(note);
  return filterRetiredSampleNotes(notes);
}

const INITIAL_NOTES: Note[] = [
  {
    id: 'sample-shopping',
    title: '週末の買い物リスト 🛒',
    content: `今週の週末に買い出しに行く食材と日用品リスト。

> 買い忘れがないように事前に整理しておく。`,
    tags: ['買い物', 'ToDo'],
    tasks: [
      { id: 'shop-1', text: '牛乳と低脂肪ヨーグルト', completed: true },
      { id: 'shop-2', text: 'ドリップコーヒーの豆（深煎り）', completed: false, dueDate: toDateTimeLocalValue(Date.now() + 3600000 * 4) },
      { id: 'shop-3', text: 'キッチンペーパーと洗剤', completed: false }
    ],
    attachments: [],
    dueDate: toDateTimeLocalValue(Date.now() + 3600000 * 5),
    reminderActive: true,
    isPinned: false,
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
    version: 1,
  }
];

export async function getAllNotes(): Promise<Note[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rawResult: unknown = request.result;
        const strictResult = parseNotesArray(rawResult);
        const parsedResult = strictResult ?? salvageNotesArray(rawResult);
        const result = migrateRetiredSampleNotes(parsedResult);

        if (result.length !== parsedResult.length) {
          void saveAllNotes(result).catch((err) => console.warn('Failed to persist retired sample migration', err));
        }

        if (strictResult === null && Array.isArray(rawResult) && rawResult.length > parsedResult.length) {
          console.warn('Corrupted local note entries were ignored during recovery.');
          if (result.length > 0) {
            void saveAllNotes(result).catch((err) => console.warn('Failed to persist recovered notes', err));
          }
        }

        if (result.length === 0 && !wasInitialized()) {
          // Seed sample notes only on the real first launch. If the user intentionally
          // deletes/imports everything, an empty notebook must stay empty after reload.
          void saveAllNotes(INITIAL_NOTES)
            .catch((err) => console.warn('Failed to persist initial notes', err))
            .finally(() => resolve(sortNotesForDisplay(INITIAL_NOTES)));
          return;
        }

        resolve(sortNotesForDisplay(result));
      };

      request.onerror = () => {
        resolve(getNotesFromLocalStorage());
      };
    });
  } catch {
    return getNotesFromLocalStorage();
  }
}

export async function saveNote(note: Note): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(note);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    markInitialized();
    return;
  } catch (indexedDbError) {
    try {
      saveNoteToLocalStorage(note);
      markInitialized();
      return;
    } catch (fallbackError) {
      console.error('Both IndexedDB and localStorage save failed', indexedDbError, fallbackError);
      throw new Error('メモを端末に保存できませんでした。空き容量やブラウザ設定を確認してください。');
    }
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    markInitialized();
    return;
  } catch (indexedDbError) {
    try {
      deleteNoteFromLocalStorage(id);
      markInitialized();
      return;
    } catch (fallbackError) {
      console.error('Both IndexedDB and localStorage delete failed', indexedDbError, fallbackError);
      throw new Error('メモを端末から削除できませんでした。');
    }
  }
}

export async function saveAllNotes(notes: Note[]): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      notes.forEach((note) => store.put(note));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
    markInitialized();
    return;
  } catch (indexedDbError) {
    try {
      localStorage.setItem('ios_notes_data', JSON.stringify(notes));
      markInitialized();
      return;
    } catch (fallbackError) {
      console.error('Both IndexedDB and localStorage bulk save failed', indexedDbError, fallbackError);
      throw new Error('メモのバックアップを端末に保存できませんでした。');
    }
  }
}

// LocalStorage Fallbacks
function wasInitialized(): boolean {
  try {
    return localStorage.getItem(INITIALIZED_KEY) === '1';
  } catch {
    return false;
  }
}

function markInitialized(): void {
  try {
    localStorage.setItem(INITIALIZED_KEY, '1');
  } catch {
    // IndexedDB may still be available even when localStorage is blocked.
  }
}

function getNotesFromLocalStorage(): Note[] {
  try {
    const data = localStorage.getItem('ios_notes_data');
    if (!data) {
      if (wasInitialized()) return [];
      localStorage.setItem('ios_notes_data', JSON.stringify(INITIAL_NOTES));
      markInitialized();
      return sortNotesForDisplay(INITIAL_NOTES);
    }

    const parsed: unknown = JSON.parse(data);
    const strict = parseNotesArray(parsed);
    if (strict) {
      const migrated = migrateRetiredSampleNotes(strict);
      if (migrated.length !== strict.length) {
        localStorage.setItem('ios_notes_data', JSON.stringify(migrated));
      }
      return sortNotesForDisplay(migrated);
    }

    const salvaged = salvageNotesArray(parsed);
    if (salvaged.length > 0) {
      const migrated = migrateRetiredSampleNotes(salvaged);
      localStorage.setItem('ios_notes_data', JSON.stringify(migrated));
      return sortNotesForDisplay(migrated);
    }

    return [];
  } catch {
    return wasInitialized() ? [] : sortNotesForDisplay(INITIAL_NOTES);
  }
}

function saveNoteToLocalStorage(note: Note) {
  const notes = getNotesFromLocalStorage().filter((n) => n.id !== note.id);
  notes.unshift(note);
  localStorage.setItem('ios_notes_data', JSON.stringify(notes));
}

function deleteNoteFromLocalStorage(id: string) {
  const notes = getNotesFromLocalStorage().filter((n) => n.id !== id);
  localStorage.setItem('ios_notes_data', JSON.stringify(notes));
}

// Cloudflare Configuration Storage
const CLOUDFLARE_CONFIG_KEY = 'ios_notes_cloudflare_config';

export const DEFAULT_CF_CONFIG: CloudflareSyncConfig = {
  workerUrl: '/api/sync',
  apiToken: '',
  kvNamespace: 'MEMOMEMO_KV',
  syncCode: '',
  autoSync: true,
  lastSyncTime: null,
  status: 'idle',
  errorMessage: null,
};

export function getCloudflareConfig(): CloudflareSyncConfig {
  let config: CloudflareSyncConfig = { ...DEFAULT_CF_CONFIG };
  try {
    const saved = localStorage.getItem(CLOUDFLARE_CONFIG_KEY);
    if (saved) {
      config = { ...DEFAULT_CF_CONFIG, ...JSON.parse(saved) };
    }
  } catch {
    // Keep safe defaults if old config JSON is malformed.
  }

  let changed = false;
  if (!config.workerUrl?.trim()) {
    config.workerUrl = '/api/sync';
    changed = true;
  }
  if (!config.syncCode) {
    config.syncCode = generateSyncCode();
    config.autoSync = true;
    config.status = 'idle';
    config.errorMessage = null;
    changed = true;
  }
  if (changed) saveCloudflareConfig(config);
  return config;
}

export function saveCloudflareConfig(config: CloudflareSyncConfig): void {
  try {
    localStorage.setItem(CLOUDFLARE_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save Cloudflare config', err);
  }
}
