from pathlib import Path
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise RuntimeError(f'Patch target not found: {label}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count == 0:
        if replacement.strip() in text:
            return text
        raise RuntimeError(f'Regex patch target not found: {label}')
    return updated


# --- New helpers -----------------------------------------------------------
write('src/services/dateTime.ts', r'''/**
 * Convert a Date/epoch to the local value expected by <input type="datetime-local">.
 * Do not use toISOString() here because it converts to UTC and shifts the visible time.
 */
export function toDateTimeLocalValue(input: Date | number): string {
  const date = typeof input === 'number' ? new Date(input) : input;
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}
''')

write('src/services/noteValidation.ts', r'''import { AttachmentItem, Note, TaskItem } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidOptionalDate(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length > 0 && Number.isFinite(new Date(value).getTime()))
  );
}

function parseTask(value: unknown): TaskItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.text !== 'string') return null;
  if (typeof value.completed !== 'boolean') return null;
  if (!isValidOptionalDate(value.dueDate)) return null;

  return {
    id: value.id,
    text: value.text,
    completed: value.completed,
    ...(value.dueDate ? { dueDate: value.dueDate } : {}),
  };
}

function parseAttachment(value: unknown): AttachmentItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.name !== 'string') return null;
  if (!['image', 'pdf', 'other'].includes(String(value.type))) return null;
  if (typeof value.mimeType !== 'string') return null;
  if (!isFiniteNumber(value.size) || value.size < 0) return null;
  if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:')) return null;
  if (!isFiniteNumber(value.createdAt)) return null;

  return {
    id: value.id,
    name: value.name,
    type: value.type as AttachmentItem['type'],
    mimeType: value.mimeType,
    size: value.size,
    dataUrl: value.dataUrl,
    createdAt: value.createdAt,
  };
}

function parseNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.title !== 'string') return null;
  if (typeof value.content !== 'string') return null;
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string')) return null;
  if (!Array.isArray(value.tasks)) return null;
  if (!Array.isArray(value.attachments)) return null;
  if (!isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt)) return null;
  if (!isFiniteNumber(value.version) || value.version < 1) return null;
  if (!isValidOptionalDate(value.dueDate)) return null;
  if (value.reminderActive !== undefined && typeof value.reminderActive !== 'boolean') return null;
  if (value.isPinned !== undefined && typeof value.isPinned !== 'boolean') return null;

  const tasks = value.tasks.map(parseTask);
  if (tasks.some((task) => task === null)) return null;

  const attachments = value.attachments.map(parseAttachment);
  if (attachments.some((attachment) => attachment === null)) return null;

  return {
    id: value.id,
    title: value.title,
    content: value.content,
    tags: Array.from(new Set(value.tags as string[])),
    tasks: tasks as TaskItem[],
    attachments: attachments as AttachmentItem[],
    ...(value.dueDate ? { dueDate: value.dueDate } : {}),
    ...(value.reminderActive !== undefined ? { reminderActive: value.reminderActive } : {}),
    ...(value.isPinned !== undefined ? { isPinned: value.isPinned } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    version: value.version,
  };
}

export function sortNotesForDisplay(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** Strict parser used for imports and remote sync payloads. */
export function parseNotesArray(value: unknown): Note[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: Note[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const note = parseNote(item);
    if (!note || ids.has(note.id)) return null;
    ids.add(note.id);
    parsed.push(note);
  }

  return sortNotesForDisplay(parsed);
}

/** Best-effort recovery for already-corrupted local storage. Invalid entries are discarded. */
export function salvageNotesArray(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];

  const byId = new Map<string, Note>();
  for (const item of value) {
    const note = parseNote(item);
    if (!note) continue;
    const existing = byId.get(note.id);
    if (!existing || note.updatedAt > existing.updatedAt || (note.updatedAt === existing.updatedAt && note.version > existing.version)) {
      byId.set(note.id, note);
    }
  }

  return sortNotesForDisplay(Array.from(byId.values()));
}

/** Merge remote data without ever rolling back a newer local edit. */
export function mergeNotesByFreshness(localNotes: Note[], remoteNotes: Note[]): Note[] {
  const byId = new Map<string, Note>();

  for (const note of [...remoteNotes, ...localNotes]) {
    const existing = byId.get(note.id);
    if (
      !existing ||
      note.updatedAt > existing.updatedAt ||
      (note.updatedAt === existing.updatedAt && note.version >= existing.version)
    ) {
      byId.set(note.id, note);
    }
  }

  return sortNotesForDisplay(Array.from(byId.values()));
}
''')

# --- storage.ts ------------------------------------------------------------
storage = read('src/services/storage.ts')
storage = replace_once(
    storage,
    "import { Note, CloudflareSyncConfig } from '../types';\n",
    "import { Note, CloudflareSyncConfig } from '../types';\nimport { toDateTimeLocalValue } from './dateTime';\nimport { parseNotesArray, salvageNotesArray, sortNotesForDisplay } from './noteValidation';\n",
    'storage imports',
)
storage = replace_once(
    storage,
    "const STORE_NAME = 'notes';\n",
    "const STORE_NAME = 'notes';\nconst INITIALIZED_KEY = 'ios_notes_initialized_v1';\n",
    'initialized key',
)
storage = storage.replace("new Date(Date.now() + 86400000).toISOString().slice(0, 16)", "toDateTimeLocalValue(Date.now() + 86400000)")
storage = storage.replace("new Date(Date.now() + 3600000 * 4).toISOString().slice(0, 16)", "toDateTimeLocalValue(Date.now() + 3600000 * 4)")
storage = storage.replace("new Date(Date.now() + 3600000 * 5).toISOString().slice(0, 16)", "toDateTimeLocalValue(Date.now() + 3600000 * 5)")

old_get_all = r'''export async function getAllNotes(): Promise<Note[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = request.result as Note[];
        if (!result || result.length === 0) {
          // Initialize with sample notes
          saveAllNotes(INITIAL_NOTES).then(() => resolve(INITIAL_NOTES));
        } else {
          // Sort by pinned then updatedAt desc
          result.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.updatedAt - a.updatedAt;
          });
          resolve(result);
        }
      };

      request.onerror = () => {
        resolve(getNotesFromLocalStorage());
      };
    });
  } catch {
    return getNotesFromLocalStorage();
  }
}
'''
new_get_all = r'''export async function getAllNotes(): Promise<Note[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const rawResult: unknown = request.result;
        const strictResult = parseNotesArray(rawResult);
        const result = strictResult ?? salvageNotesArray(rawResult);

        if (strictResult === null && Array.isArray(rawResult) && rawResult.length > result.length) {
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
'''
storage = replace_once(storage, old_get_all, new_get_all, 'getAllNotes')

pattern_save_block = r'''export async function saveNote\(note: Note\): Promise<void> \{.*?\n\}\n\nexport async function deleteNote\(id: string\): Promise<void> \{.*?\n\}\n\nexport async function saveAllNotes\(notes: Note\[\]\): Promise<void> \{.*?\n\}\n'''
new_save_block = r'''export async function saveNote(note: Note): Promise<void> {
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
'''
storage = regex_once(storage, pattern_save_block, new_save_block, 'storage write functions')

old_local = r'''function getNotesFromLocalStorage(): Note[] {
  try {
    const data = localStorage.getItem('ios_notes_data');
    if (!data) {
      localStorage.setItem('ios_notes_data', JSON.stringify(INITIAL_NOTES));
      return INITIAL_NOTES;
    }
    return JSON.parse(data);
  } catch {
    return INITIAL_NOTES;
  }
}

function saveNoteToLocalStorage(note: Note) {
  try {
    const notes = getNotesFromLocalStorage().filter((n) => n.id !== note.id);
    notes.unshift(note);
    localStorage.setItem('ios_notes_data', JSON.stringify(notes));
  } catch (err) {
    console.warn('LocalStorage save failed', err);
  }
}

function deleteNoteFromLocalStorage(id: string) {
  try {
    const notes = getNotesFromLocalStorage().filter((n) => n.id !== id);
    localStorage.setItem('ios_notes_data', JSON.stringify(notes));
  } catch (err) {
    console.warn('LocalStorage delete failed', err);
  }
}
'''
new_local = r'''function wasInitialized(): boolean {
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
    if (strict) return strict;

    const salvaged = salvageNotesArray(parsed);
    if (salvaged.length > 0) {
      localStorage.setItem('ios_notes_data', JSON.stringify(salvaged));
      return salvaged;
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
'''
storage = replace_once(storage, old_local, new_local, 'localStorage helpers')
write('src/services/storage.ts', storage)

# --- cloudflareSync.ts -----------------------------------------------------
sync = read('src/services/cloudflareSync.ts')
sync = replace_once(
    sync,
    "import { Note, CloudflareSyncConfig } from '../types';\n",
    "import { Note, CloudflareSyncConfig } from '../types';\nimport { parseNotesArray } from './noteValidation';\n",
    'cloudflare sync import',
)

old_remote_return = r'''    const data = await response.json().catch(() => null);

    // サーバー側から新しいメモ一覧が返ってきた場合マージ対応
    return {
      success: true,
      remoteNotes: data?.notes || notes
    };
'''
new_remote_return = r'''    const data: unknown = await response.json().catch(() => null);
    if (data && typeof data === 'object' && 'notes' in data) {
      const parsedRemoteNotes = parseNotesArray((data as { notes?: unknown }).notes);
      if (!parsedRemoteNotes) {
        return {
          success: false,
          error: '同期先から不正なメモデータが返されました。ローカルの内容は上書きしていません。'
        };
      }
      return { success: true, remoteNotes: parsedRemoteNotes };
    }

    // A successful Worker may only return { success, count }. In that case do not
    // feed the submitted snapshot back into React state; doing so can roll back edits
    // made while the request was in flight.
    return { success: true };
'''
sync = replace_once(sync, old_remote_return, new_remote_return, 'remote response handling')

sync = sync.replace("    const response = await fetch(config.workerUrl, {", "    const workerUrl = config.workerUrl.trim();\n    try {\n      const parsedUrl = new URL(workerUrl);\n      if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error('unsupported protocol');\n    } catch {\n      return { success: false, error: 'Cloudflare Worker URLの形式が正しくありません。' };\n    }\n\n    const response = await fetch(workerUrl, {")

# Harden the copyable Worker template while keeping authentication optional for backward compatibility.
sync = sync.replace(
    "    const corsHeaders = {\n      'Access-Control-Allow-Origin': '*',\n      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',\n      'Access-Control-Allow-Headers': 'Content-Type, Authorization',\n    };",
    "    const corsHeaders = {\n      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',\n      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',\n      'Access-Control-Allow-Headers': 'Content-Type, Authorization',\n    };",
)
sync = sync.replace(
    "    try {\n      if (request.method === 'GET') {",
    "    try {\n      // Recommended: set SYNC_TOKEN as a Worker secret and enter the same token in the app.\n      if (env.SYNC_TOKEN) {\n        const authorization = request.headers.get('Authorization') || '';\n        if (authorization !== `Bearer ${env.SYNC_TOKEN}`) {\n          return new Response('Unauthorized', { status: 401, headers: corsHeaders });\n        }\n      }\n\n      if (request.method === 'GET') {",
)
sync = sync.replace(
    "          return new Response(JSON.stringify({ success: true, count: body.notes.length }), {",
    "          return new Response(JSON.stringify({ success: true, count: body.notes.length, notes: body.notes }), {",
)
write('src/services/cloudflareSync.ts', sync)

# --- App.tsx ---------------------------------------------------------------
app = read('src/App.tsx')
app = replace_once(
    app,
    "import { syncWithCloudflare } from './services/cloudflareSync';\n",
    "import { syncWithCloudflare } from './services/cloudflareSync';\nimport { mergeNotesByFreshness } from './services/noteValidation';\n",
    'App validation import',
)
app = replace_once(
    app,
    "  const [cfConfig, setCfConfig] = useState<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);\n",
    "  const [cfConfig, setCfConfig] = useState<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);\n  const notesRef = useRef<Note[]>([]);\n  const cfConfigRef = useRef<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);\n",
    'App refs',
)
app = replace_once(
    app,
    "        const loadedNotes = await getAllNotes();\n        setNotes(loadedNotes);\n        const config = getCloudflareConfig();\n        setCfConfig(config);",
    "        const loadedNotes = await getAllNotes();\n        notesRef.current = loadedNotes;\n        setNotes(loadedNotes);\n        const config = getCloudflareConfig();\n        cfConfigRef.current = config;\n        setCfConfig(config);",
    'initial load refs',
)

pattern_app_sync = r'''  // Debounced auto-sync to Cloudflare\n  const autoSyncTimer = useRef<number \| null>\(null\);.*?\n  // Create New Note'''
new_app_sync = r'''  // Debounced auto-sync to Cloudflare. Refs are updated synchronously so a delayed
  // request always reads the latest notes/config instead of a stale render snapshot.
  const autoSyncTimer = useRef<number | null>(null);

  const applyCloudflareConfig = useCallback((updated: CloudflareSyncConfig) => {
    cfConfigRef.current = updated;
    setCfConfig(updated);
    saveCloudflareConfig(updated);
  }, []);

  const reportStorageError = useCallback((action: string, err: unknown) => {
    console.error(`${action} failed`, err);
    setInAppAlert({
      title: '⚠️ メモを保存できませんでした',
      body: err instanceof Error ? err.message : '端末の空き容量やブラウザの保存設定を確認してください。',
    });
  }, []);

  const triggerCloudflareSync = useCallback(async (configOverride?: CloudflareSyncConfig) => {
    const configToUse = configOverride ?? cfConfigRef.current;
    if (!configToUse.workerUrl.trim()) {
      applyCloudflareConfig({
        ...cfConfigRef.current,
        ...configToUse,
        status: 'error',
        errorMessage: 'Cloudflare WorkerのURLを設定してください。',
      });
      return;
    }

    const syncingConfig: CloudflareSyncConfig = {
      ...cfConfigRef.current,
      ...configToUse,
      status: 'syncing',
      errorMessage: null,
    };
    cfConfigRef.current = syncingConfig;
    setCfConfig(syncingConfig);

    const notesToSync = notesRef.current;
    const result = await syncWithCloudflare(notesToSync, configToUse);

    if (result.success) {
      if (result.remoteNotes) {
        // Never replace local state blindly. If the user edited while the request was
        // in flight, the newest updatedAt/version wins.
        const mergedNotes = mergeNotesByFreshness(notesRef.current, result.remoteNotes);
        notesRef.current = mergedNotes;
        setNotes(mergedNotes);
        try {
          await saveAllNotes(mergedNotes);
        } catch (err) {
          reportStorageError('同期後の保存', err);
          applyCloudflareConfig({
            ...cfConfigRef.current,
            status: 'error',
            errorMessage: '同期データを端末に保存できませんでした。',
          });
          return;
        }
      }

      applyCloudflareConfig({
        ...cfConfigRef.current,
        status: 'success',
        lastSyncTime: Date.now(),
        errorMessage: null,
      });
    } else {
      applyCloudflareConfig({
        ...cfConfigRef.current,
        status: 'error',
        errorMessage: result.error || '同期に失敗しました',
      });
    }
  }, [applyCloudflareConfig, reportStorageError]);

  const scheduleAutoSync = useCallback(() => {
    const currentConfig = cfConfigRef.current;
    if (!currentConfig.autoSync || !currentConfig.workerUrl.trim()) return;
    if (autoSyncTimer.current) window.clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = window.setTimeout(() => {
      void triggerCloudflareSync();
    }, 3000);
  }, [triggerCloudflareSync]);

  useEffect(() => {
    return () => {
      if (autoSyncTimer.current) window.clearTimeout(autoSyncTimer.current);
    };
  }, []);

  // Handle Note Save/Update. Keep this outside a React state-updater function so
  // StrictMode cannot run storage/network side effects twice in development.
  const handleUpdateNote = (updatedNote: Note) => {
    const currentNotes = notesRef.current;
    const existing = currentNotes.find((n) => n.id === updatedNote.id);
    const noteToSave: Note = existing
      ? {
          ...updatedNote,
          version: Math.max((existing.version || 1) + 1, updatedNote.version || 1),
        }
      : updatedNote;

    const nextNotes = existing
      ? currentNotes.map((n) => (n.id === noteToSave.id ? noteToSave : n))
      : [noteToSave, ...currentNotes];

    notesRef.current = nextNotes;
    setNotes(nextNotes);
    void saveNote(noteToSave).catch((err) => reportStorageError('メモ保存', err));
    scheduleAutoSync();
  };

  // Create New Note'''
app = regex_once(app, pattern_app_sync, new_app_sync, 'App sync/update block')

app = replace_once(
    app,
    "    setNotes((prev) => [newNote, ...prev]);\n    setSelectedNoteId(newNote.id);\n    saveNote(newNote);",
    "    const nextNotes = [newNote, ...notesRef.current];\n    notesRef.current = nextNotes;\n    setNotes(nextNotes);\n    setSelectedNoteId(newNote.id);\n    void saveNote(newNote).catch((err) => reportStorageError('新規メモ保存', err));\n    scheduleAutoSync();",
    'create note state',
)

old_delete = r'''  const handleDeleteNote = async (noteId: string) => {
    await deleteNoteStorage(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
  };
'''
new_delete = r'''  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNoteStorage(noteId);
    } catch (err) {
      reportStorageError('メモ削除', err);
      return;
    }

    const nextNotes = notesRef.current.filter((n) => n.id !== noteId);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
    scheduleAutoSync();
  };
'''
app = replace_once(app, old_delete, new_delete, 'delete note')
app = app.replace("const targetNote = notes.find((n) => n.id === noteId);", "const targetNote = notesRef.current.find((n) => n.id === noteId);")

app = replace_once(
    app,
    "      <div className=\"w-full max-w-5xl px-4 py-2 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400\">",
    "      <div className=\"hidden md:flex w-full max-w-5xl px-4 py-2 items-center justify-between text-xs text-neutral-600 dark:text-neutral-400\">",
    'hide demo controls mobile',
)
app = app.replace("{isOnline ? '🟢 オンライン (IndexedDB保存済み)' : '🔌 オフライン動作中'}", "{isOnline ? '🟢 オンライン' : '🔌 オフライン動作中'}")
app = replace_once(
    app,
    "            : 'max-w-5xl h-[92vh] my-1 sm:my-2 px-0 sm:px-4'",
    "            : 'max-w-5xl h-[100dvh] md:h-[92vh] my-0 md:my-2 px-0 md:px-4'",
    'mobile full height',
)
app = replace_once(
    app,
    "              : 'rounded-2xl sm:rounded-3xl shadow-xl border border-neutral-300 dark:border-neutral-800'",
    "              : 'rounded-none md:rounded-3xl shadow-none md:shadow-xl border-0 md:border border-neutral-300 dark:border-neutral-800'",
    'mobile full bleed chassis',
)

old_modal_save = r'''        onSaveConfig={(updated) => {
          setCfConfig(updated);
          saveCloudflareConfig(updated);
        }}'''
app = replace_once(app, old_modal_save, "        onSaveConfig={applyCloudflareConfig}", 'modal config save')

old_import = r'''        onImportNotes={(importedNotes) => {
          setNotes(importedNotes);
          saveAllNotes(importedNotes);
        }}'''
new_import = r'''        onImportNotes={(importedNotes) => {
          notesRef.current = importedNotes;
          setNotes(importedNotes);
          setSelectedNoteId(null);
          void saveAllNotes(importedNotes).catch((err) => reportStorageError('バックアップ復元', err));
        }}'''
app = replace_once(app, old_import, new_import, 'import notes state')
write('src/App.tsx', app)

# --- NoteEditor.tsx --------------------------------------------------------
editor = read('src/components/NoteEditor.tsx')
editor = replace_once(
    editor,
    "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n",
    "  const textareaRef = useRef<HTMLTextAreaElement>(null);\n  const latestNoteRef = useRef<Note>(note);\n  latestNoteRef.current = note;\n",
    'latest note ref',
)

pattern_process = r'''  // Handle File Upload \(Image or PDF\)\n  const processFiles = \(files: FileList \| null\) => \{.*?\n  \};\n\n  const handleFileInputChange'''
new_process = r'''  // Handle File Upload (Image or PDF). Read the whole selection first and then
  // update once, otherwise simultaneous FileReader callbacks overwrite each other.
  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;
    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/');
      return (isPdf || isImg) && file.size <= MAX_ATTACHMENT_SIZE;
    });

    const rejectedFiles = selectedFiles.filter((file) => !validFiles.includes(file));
    if (rejectedFiles.length > 0) {
      alert(
        `画像またはPDF（1ファイル15MB以下）のみ添付できます。\n対象外: ${rejectedFiles
          .map((file) => file.name)
          .join(', ')}`
      );
    }
    if (validFiles.length === 0) return;

    try {
      const newAttachments = await Promise.all(
        validFiles.map(
          (file, index) =>
            new Promise<AttachmentItem>((resolve, reject) => {
              const isPdf =
                file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
              const reader = new FileReader();
              reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
              reader.onload = (event) => {
                const dataUrl = event.target?.result;
                if (typeof dataUrl !== 'string' || !dataUrl) {
                  reject(new Error(`Failed to read ${file.name}`));
                  return;
                }

                resolve({
                  id: `att-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
                  name: file.name,
                  type: isPdf ? 'pdf' : 'image',
                  mimeType: file.type || (isPdf ? 'application/pdf' : 'image/*'),
                  size: file.size,
                  dataUrl,
                  createdAt: Date.now(),
                });
              };
              reader.readAsDataURL(file);
            })
        )
      );

      const latestNote = latestNoteRef.current;
      onUpdateNote({
        ...latestNote,
        attachments: [...latestNote.attachments, ...newAttachments],
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Attachment read failed', err);
      alert('添付ファイルの読み込みに失敗しました。ファイルを確認してもう一度お試しください。');
    }
  };

  const handleFileInputChange'''
editor = regex_once(editor, pattern_process, new_process, 'multi attachment processing')
editor = editor.replace("    processFiles(e.target.files);", "    void processFiles(e.target.files);")
editor = editor.replace("    processFiles(e.dataTransfer.files);", "    void processFiles(e.dataTransfer.files);")
write('src/components/NoteEditor.tsx', editor)

# --- CloudflareModal.tsx ---------------------------------------------------
modal = read('src/components/CloudflareModal.tsx')
modal = replace_once(
    modal,
    "import { SAMPLE_WORKER_CODE } from '../services/cloudflareSync';\n",
    "import { SAMPLE_WORKER_CODE } from '../services/cloudflareSync';\nimport { parseNotesArray } from '../services/noteValidation';\n",
    'modal validation import',
)
modal = modal.replace("  onTriggerSync: () => Promise<void>;", "  onTriggerSync: (configOverride?: CloudflareSyncConfig) => Promise<void>;")
modal = replace_once(modal, "      await onTriggerSync();", "      await onTriggerSync(formData);", 'manual sync latest form data')

old_import_handler = r'''  // Import local notes JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportNotes(parsed);
          alert(`${parsed.length} 件のメモをインポートしました。`);
        } else {
          alert('不正なメモファイル形式です。');
        }
      } catch {
        alert('ファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
  };
'''
new_import_handler = r'''  // Import local notes JSON. Validate every nested field before touching state/storage.
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(String(event.target?.result ?? ''));
        const validatedNotes = parseNotesArray(parsed);
        if (!validatedNotes) {
          alert('このJSONはMEMOMEMOの正しいバックアップ形式ではありません。現在のメモは変更していません。');
          return;
        }

        onImportNotes(validatedNotes);
        alert(`${validatedNotes.length} 件のメモをインポートしました。`);
      } catch {
        alert('JSONファイルを読み込めませんでした。現在のメモは変更していません。');
      } finally {
        input.value = '';
      }
    };
    reader.onerror = () => {
      alert('ファイルの読み込みに失敗しました。現在のメモは変更していません。');
      input.value = '';
    };
    reader.readAsText(file);
  };
'''
modal = replace_once(modal, old_import_handler, new_import_handler, 'safe JSON import')
modal = modal.replace('Workers KV を使って複数端末間でメモを安全に同期', 'Workers KV を使って複数端末間でメモを同期')
modal = modal.replace('API トークン（任意 / 認証保護時）', 'API トークン（推奨 / Worker側で認証設定時）')
write('src/components/CloudflareModal.tsx', modal)

# --- RemindersModal.tsx ----------------------------------------------------
reminders = read('src/components/RemindersModal.tsx')
reminders = replace_once(
    reminders,
    "import { requestNotificationPermission } from '../services/notifications';\n",
    "import { requestNotificationPermission } from '../services/notifications';\nimport { toDateTimeLocalValue } from '../services/dateTime';\n",
    'reminder date import',
)
reminders = reminders.replace("body: '期日を迎えたメモやToDoタスクを自動でお知らせします。',", "body: 'アプリを開いている間、期日が近いメモやToDoタスクをお知らせします。',")
reminders = reminders.replace("new Date(Date.now() + 86400000).toISOString().slice(0, 16)", "toDateTimeLocalValue(Date.now() + 86400000)")
reminders = reminders.replace('未完了タスク {pendingTasks.length} 件 (定期的にバックグラウンドで期限を監視しています)', '未完了タスク {pendingTasks.length} 件 (アプリを開いている間、30秒ごとに期限を確認します)')
write('src/components/RemindersModal.tsx', reminders)

# --- index.html ------------------------------------------------------------
index = read('index.html')
index = index.replace('width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
write('index.html', index)

print('Memomemo safety patches applied successfully.')
