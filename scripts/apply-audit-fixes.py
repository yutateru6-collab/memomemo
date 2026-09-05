from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0:
        if new in text:
            print(f'[skip] {label}: already applied')
            return text
        raise RuntimeError(f'{label}: target not found')
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 target, found {count}')
    print(f'[apply] {label}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count == 0:
        print(f'[skip] {label}: regex target not found (possibly already applied)')
        return text
    print(f'[apply] {label}')
    return updated


# ---------------------------------------------------------------------------
# Shared local datetime utility: datetime-local expects local wall-clock time,
# so never feed it a UTC string produced by Date#toISOString().
# ---------------------------------------------------------------------------
write('src/utils/date.ts', '''export function toLocalDateTimeInputValue(value: Date | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}
''')
print('[write] src/utils/date.ts')


# ---------------------------------------------------------------------------
# storage.ts: validate/normalize persisted data, keep fallback mirror aligned,
# wait for IDB transaction completion, and fix UTC datetime-local generation.
# ---------------------------------------------------------------------------
path = 'src/services/storage.ts'
text = read(path)
text = replace_once(
    text,
    "import { Note, CloudflareSyncConfig } from '../types';\n",
    "import { Note, CloudflareSyncConfig, TaskItem, AttachmentItem } from '../types';\nimport { toLocalDateTimeInputValue } from '../utils/date';\n",
    'storage imports',
)
text = text.replace("title: 'iOS Notes へようこそ 📝'", "title: 'Memomemo へようこそ 📝'")
text = text.replace('iPhoneの使い心地をそのままウェブで実現したミニマルなメモ帳です。', '端末内保存を中心に、すばやく書いて整理できるミニマルなメモ帳です。')
text = text.replace('- **期限＆プッシュ通知**: やってないことを逃さずリマインド', '- **期限＆通知**: アプリを開いている間、期限が近い項目をリマインド')
text = text.replace('- **オフライン対応**: IndexedDBによる完全オフライン動作', '- **端末内保存**: IndexedDBにメモを保存')
text = text.replace('console.log("Hello, iPhone Notes!");', 'console.log("Hello, Memomemo!");')
text = text.replace("new Date(Date.now() + 86400000).toISOString().slice(0, 16)", "toLocalDateTimeInputValue(Date.now() + 86400000)")
text = text.replace("new Date(Date.now() + 3600000 * 4).toISOString().slice(0, 16)", "toLocalDateTimeInputValue(Date.now() + 3600000 * 4)")
text = text.replace("new Date(Date.now() + 3600000 * 5).toISOString().slice(0, 16)", "toLocalDateTimeInputValue(Date.now() + 3600000 * 5)")

validation_block = '''\nfunction isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTask(value: unknown): TaskItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.text !== 'string') return null;

  return {
    id: value.id,
    text: value.text,
    completed: typeof value.completed === 'boolean' ? value.completed : false,
    dueDate: typeof value.dueDate === 'string' && value.dueDate ? value.dueDate : undefined,
  };
}

function normalizeAttachment(value: unknown): AttachmentItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.name !== 'string' || typeof value.dataUrl !== 'string') return null;

  const rawType = value.type;
  const type: AttachmentItem['type'] =
    rawType === 'image' || rawType === 'pdf' || rawType === 'other' ? rawType : 'other';

  return {
    id: value.id,
    name: value.name,
    type,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'application/octet-stream',
    size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : 0,
    dataUrl: value.dataUrl,
    createdAt:
      typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
        ? value.createdAt
        : Date.now(),
  };
}

/**
 * Validate data coming from backups, localStorage, IndexedDB, or a remote sync response.
 * Older backups are tolerated by filling optional arrays/defaults, but every note must have
 * a stable id. Returning null means the payload must not replace the user's current data.
 */
export function normalizeNotes(value: unknown): Note[] | null {
  if (!Array.isArray(value)) return null;

  const normalized: Note[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.trim()) return null;

    const tasksRaw = Array.isArray(raw.tasks) ? raw.tasks : [];
    const attachmentsRaw = Array.isArray(raw.attachments) ? raw.attachments : [];
    const tasks = tasksRaw.map(normalizeTask);
    const attachments = attachmentsRaw.map(normalizeAttachment);

    if (tasks.some((task) => task === null) || attachments.some((att) => att === null)) {
      return null;
    }

    const now = Date.now();
    const createdAt =
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
    const updatedAt =
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;

    normalized.push({
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : '無題のメモ',
      content: typeof raw.content === 'string' ? raw.content : '',
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      tasks: tasks as TaskItem[],
      attachments: attachments as AttachmentItem[],
      dueDate: typeof raw.dueDate === 'string' && raw.dueDate ? raw.dueDate : undefined,
      reminderActive: typeof raw.reminderActive === 'boolean' ? raw.reminderActive : undefined,
      isPinned: typeof raw.isPinned === 'boolean' ? raw.isPinned : false,
      createdAt,
      updatedAt,
      version:
        typeof raw.version === 'number' && Number.isFinite(raw.version) && raw.version >= 1
          ? raw.version
          : 1,
    });
  }

  return normalized;
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
}
'''
text = replace_once(text, "\nexport async function getAllNotes(): Promise<Note[]> {", validation_block + "\nexport async function getAllNotes(): Promise<Note[]> {", 'storage validation helpers')

old_get_all = '''export async function getAllNotes(): Promise<Note[]> {
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
new_get_all = '''export async function getAllNotes(): Promise<Note[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const normalized = normalizeNotes(request.result);
        if (normalized && normalized.length > 0) {
          resolve(sortNotes(normalized));
          return;
        }

        // If IndexedDB is empty/corrupt but a valid fallback exists, recover it first.
        const fallback = readNotesFromLocalStorage();
        const initial = fallback && fallback.length > 0 ? fallback : INITIAL_NOTES;
        void saveAllNotes(initial);
        resolve(sortNotes(initial));
      };

      request.onerror = () => resolve(getNotesFromLocalStorage());
    });
  } catch {
    return getNotesFromLocalStorage();
  }
}
'''
text = replace_once(text, old_get_all, new_get_all, 'storage getAllNotes')

old_save = '''export async function saveNote(note: Note): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(note);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    saveNoteToLocalStorage(note);
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    deleteNoteFromLocalStorage(id);
  }
}

export async function saveAllNotes(notes: Note[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      notes.forEach((note) => store.put(note));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    localStorage.setItem('ios_notes_data', JSON.stringify(notes));
  }
}

// LocalStorage Fallbacks
function getNotesFromLocalStorage(): Note[] {
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
'''
new_save = '''export async function saveNote(note: Note): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(note);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    // Keep a best-effort fallback mirror. Large attachments may exceed localStorage quota,
    // in which case IndexedDB remains the source of truth and the fallback write is ignored.
    saveNoteToLocalStorage(note);
  } catch {
    saveNoteToLocalStorage(note);
  }
}

export async function deleteNote(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    deleteNoteFromLocalStorage(id);
  } catch {
    deleteNoteFromLocalStorage(id);
  }
}

export async function saveAllNotes(notes: Note[]): Promise<void> {
  const normalized = normalizeNotes(notes);
  if (!normalized) throw new Error('Invalid notes payload');

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      normalized.forEach((note) => store.put(note));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    saveAllNotesToLocalStorage(normalized);
  } catch {
    saveAllNotesToLocalStorage(normalized);
  }
}

// LocalStorage Fallbacks
function readNotesFromLocalStorage(): Note[] | null {
  try {
    const data = localStorage.getItem('ios_notes_data');
    if (!data) return null;
    return normalizeNotes(JSON.parse(data));
  } catch {
    return null;
  }
}

function getNotesFromLocalStorage(): Note[] {
  const saved = readNotesFromLocalStorage();
  if (saved) return sortNotes(saved);
  saveAllNotesToLocalStorage(INITIAL_NOTES);
  return sortNotes(INITIAL_NOTES);
}

function saveAllNotesToLocalStorage(notes: Note[]) {
  try {
    localStorage.setItem('ios_notes_data', JSON.stringify(notes));
  } catch (err) {
    console.warn('LocalStorage mirror save failed', err);
  }
}
'''
text = replace_once(text, old_save, new_save, 'storage persistence')
write(path, text)


# ---------------------------------------------------------------------------
# cloudflareSync.ts: never treat the just-sent local array as a remote response;
# validate remote arrays, and make the Worker template optionally authenticated.
# ---------------------------------------------------------------------------
path = 'src/services/cloudflareSync.ts'
text = read(path)
text = replace_once(text, "import { Note, CloudflareSyncConfig } from '../types';\n", "import { Note, CloudflareSyncConfig } from '../types';\nimport { normalizeNotes } from './storage';\n", 'sync validation import')
text = replace_once(
    text,
    '''    const data = await response.json().catch(() => null);

    // サーバー側から新しいメモ一覧が返ってきた場合マージ対応
    return {
      success: true,
      remoteNotes: data?.notes || notes
    };
''',
    '''    const data = await response.json().catch(() => null);
    const remoteNotes = data && Object.prototype.hasOwnProperty.call(data, 'notes')
      ? normalizeNotes(data.notes)
      : null;

    if (data && Object.prototype.hasOwnProperty.call(data, 'notes') && remoteNotes === null) {
      return {
        success: false,
        error: '同期先から不正なメモデータが返されました。ローカルデータは変更していません。'
      };
    }

    // remoteNotes is included only when the server actually returned a valid notes array.
    // A normal "saved successfully" response must never echo stale local state back into React.
    return remoteNotes === null
      ? { success: true }
      : { success: true, remoteNotes };
''',
    'sync remote response semantics',
)
text = text.replace(' * Cloudflare Worker for iOS Notes Sync', ' * Cloudflare Worker for Memomemo Sync')
text = text.replace(" * 3. 以下のコードを貼り付けてデプロイ\n", " * 3. 任意: Worker secret SYNC_TOKEN を設定し、アプリ側にも同じAPIトークンを入力\n * 4. 以下のコードを貼り付けてデプロイ\n")
text = replace_once(
    text,
    '''    // CORS ヘッダー
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
''',
    '''    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // If SYNC_TOKEN is configured as a Worker secret, every data request must authenticate.
    if (env.SYNC_TOKEN) {
      const expected = 'Bearer ' + env.SYNC_TOKEN;
      if (request.headers.get('Authorization') !== expected) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    try {
''',
    'worker auth',
)
write(path, text)


# ---------------------------------------------------------------------------
# App.tsx: refs make latest notes/config authoritative, auto-sync captures latest
# state without setState side effects, remote data is merged by updatedAt, and
# manual sync can pass unsaved form config directly.
# ---------------------------------------------------------------------------
path = 'src/App.tsx'
text = read(path)
text = replace_once(
    text,
    "  saveAllNotes\n} from './services/storage';",
    "  saveAllNotes,\n  sortNotes\n} from './services/storage';",
    'App storage imports',
)
text = replace_once(
    text,
    '''  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
''',
    '''  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
''',
    'App notes ref',
)
text = replace_once(
    text,
    "  const [cfConfig, setCfConfig] = useState<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);\n",
    "  const [cfConfig, setCfConfig] = useState<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);\n  const cfConfigRef = useRef<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);\n",
    'App config ref',
)
text = replace_once(
    text,
    '''        const loadedNotes = await getAllNotes();
        setNotes(loadedNotes);
        const config = getCloudflareConfig();
        setCfConfig(config);
''',
    '''        const loadedNotes = await getAllNotes();
        notesRef.current = loadedNotes;
        setNotes(loadedNotes);
        const config = getCloudflareConfig();
        cfConfigRef.current = config;
        setCfConfig(config);
''',
    'App initial refs',
)

old_sync = '''  // Debounced auto-sync to Cloudflare
  const autoSyncTimer = useRef<number | null>(null);
  const triggerCloudflareSync = useCallback(async () => {
    if (!cfConfig.workerUrl) {
      setCfConfig((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'Cloudflare WorkerのURLを設定してください。',
      }));
      return;
    }

    setCfConfig((prev) => ({ ...prev, status: 'syncing', errorMessage: null }));

    const result = await syncWithCloudflare(notes, cfConfig);

    if (result.success) {
      const now = Date.now();
      const updatedConfig: CloudflareSyncConfig = {
        ...cfConfig,
        status: 'success',
        lastSyncTime: now,
        errorMessage: null,
      };
      setCfConfig(updatedConfig);
      saveCloudflareConfig(updatedConfig);

      if (result.remoteNotes && result.remoteNotes.length > 0) {
        // Merge notes if remote has extra or newer items
        setNotes(result.remoteNotes);
        saveAllNotes(result.remoteNotes);
      }
    } else {
      const updatedConfig: CloudflareSyncConfig = {
        ...cfConfig,
        status: 'error',
        errorMessage: result.error || '同期に失敗しました',
      };
      setCfConfig(updatedConfig);
      saveCloudflareConfig(updatedConfig);
    }
  }, [cfConfig, notes]);

  // Handle Note Save/Update
  const handleUpdateNote = (updatedNote: Note) => {
    setNotes((prevNotes) => {
      const exists = prevNotes.some((n) => n.id === updatedNote.id);
      let nextNotes: Note[];
      if (exists) {
        nextNotes = prevNotes.map((n) => (n.id === updatedNote.id ? updatedNote : n));
      } else {
        nextNotes = [updatedNote, ...prevNotes];
      }

      saveNote(updatedNote);

      // Auto-sync if enabled
      if (cfConfig.autoSync && cfConfig.workerUrl) {
        if (autoSyncTimer.current) window.clearTimeout(autoSyncTimer.current);
        autoSyncTimer.current = window.setTimeout(() => {
          triggerCloudflareSync();
        }, 3000);
      }

      return nextNotes;
    });
  };
'''
new_sync = '''  // Debounced auto-sync to Cloudflare. Refs are the authoritative snapshots so
  // delayed callbacks never send a stale React render.
  const autoSyncTimer = useRef<number | null>(null);

  const mergeRemoteNotes = useCallback((localNotes: Note[], remoteNotes: Note[]) => {
    const byId = new Map(localNotes.map((note) => [note.id, note]));
    remoteNotes.forEach((remote) => {
      const local = byId.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        byId.set(remote.id, remote);
      }
    });
    return sortNotes(Array.from(byId.values()));
  }, []);

  const triggerCloudflareSync = useCallback(async (
    notesOverride?: Note[],
    configOverride?: CloudflareSyncConfig
  ) => {
    const syncNotes = notesOverride ?? notesRef.current;
    const syncConfig = configOverride ?? cfConfigRef.current;

    if (!syncConfig.workerUrl) {
      const updatedConfig = {
        ...cfConfigRef.current,
        status: 'error' as const,
        errorMessage: 'Cloudflare WorkerのURLを設定してください。',
      };
      cfConfigRef.current = updatedConfig;
      setCfConfig(updatedConfig);
      saveCloudflareConfig(updatedConfig);
      return;
    }

    const syncingConfig = { ...syncConfig, status: 'syncing' as const, errorMessage: null };
    cfConfigRef.current = syncingConfig;
    setCfConfig(syncingConfig);

    const result = await syncWithCloudflare(syncNotes, syncConfig);

    if (result.success) {
      const updatedConfig: CloudflareSyncConfig = {
        ...cfConfigRef.current,
        status: 'success',
        lastSyncTime: Date.now(),
        errorMessage: null,
      };
      cfConfigRef.current = updatedConfig;
      setCfConfig(updatedConfig);
      saveCloudflareConfig(updatedConfig);

      if (result.remoteNotes) {
        const merged = mergeRemoteNotes(notesRef.current, result.remoteNotes);
        notesRef.current = merged;
        setNotes(merged);
        await saveAllNotes(merged);
      }
    } else {
      const updatedConfig: CloudflareSyncConfig = {
        ...cfConfigRef.current,
        status: 'error',
        errorMessage: result.error || '同期に失敗しました',
      };
      cfConfigRef.current = updatedConfig;
      setCfConfig(updatedConfig);
      saveCloudflareConfig(updatedConfig);
    }
  }, [mergeRemoteNotes]);

  const scheduleAutoSync = useCallback(() => {
    const config = cfConfigRef.current;
    if (!config.autoSync || !config.workerUrl) return;
    if (autoSyncTimer.current) window.clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = window.setTimeout(() => {
      void triggerCloudflareSync(notesRef.current, cfConfigRef.current);
    }, 3000);
  }, [triggerCloudflareSync]);

  // Handle Note Save/Update. No side effects live inside a setState updater, which
  // keeps behavior stable under React StrictMode.
  const handleUpdateNote = (updatedNote: Note) => {
    const current = notesRef.current;
    const exists = current.some((n) => n.id === updatedNote.id);
    const nextNotes = sortNotes(
      exists
        ? current.map((n) => (n.id === updatedNote.id ? updatedNote : n))
        : [updatedNote, ...current]
    );

    notesRef.current = nextNotes;
    setNotes(nextNotes);
    void saveNote(updatedNote);
    scheduleAutoSync();
  };
'''
text = replace_once(text, old_sync, new_sync, 'App sync state model')

text = replace_once(
    text,
    '''    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    saveNote(newNote);
''',
    '''    const nextNotes = sortNotes([newNote, ...notesRef.current]);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    setSelectedNoteId(newNote.id);
    void saveNote(newNote);
    scheduleAutoSync();
''',
    'App create note',
)
text = replace_once(
    text,
    '''  const handleDeleteNote = async (noteId: string) => {
    await deleteNoteStorage(noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
  };
''',
    '''  const handleDeleteNote = async (noteId: string) => {
    await deleteNoteStorage(noteId);
    const nextNotes = notesRef.current.filter((n) => n.id !== noteId);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
    scheduleAutoSync();
  };
''',
    'App delete note',
)
text = text.replace("const targetNote = notes.find((n) => n.id === noteId);", "const targetNote = notesRef.current.find((n) => n.id === noteId);")
text = text.replace('iOS Notes (日本語版)', 'Memomemo')
text = text.replace("{isOnline ? '🟢 オンライン (IndexedDB保存済み)' : '🔌 オフライン動作中'}", "{isOnline ? '🟢 オンライン' : '🔌 オフライン'}")
text = text.replace('className="w-full max-w-5xl px-4 py-2 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400"', 'className="hidden sm:flex w-full max-w-5xl px-4 py-2 items-center justify-between text-xs text-neutral-600 dark:text-neutral-400"')
text = text.replace("            : 'max-w-5xl h-[92vh] my-1 sm:my-2 px-0 sm:px-4'", "            : 'max-w-5xl h-[100dvh] sm:h-[92vh] my-0 sm:my-2 px-0 sm:px-4'")
text = replace_once(
    text,
    '''        onSaveConfig={(updated) => {
          setCfConfig(updated);
          saveCloudflareConfig(updated);
        }}
        onTriggerSync={triggerCloudflareSync}
''',
    '''        onSaveConfig={(updated) => {
          cfConfigRef.current = updated;
          setCfConfig(updated);
          saveCloudflareConfig(updated);
        }}
        onTriggerSync={(configOverride) => triggerCloudflareSync(notesRef.current, configOverride)}
''',
    'App modal config sync',
)
text = replace_once(
    text,
    '''        onImportNotes={(importedNotes) => {
          setNotes(importedNotes);
          saveAllNotes(importedNotes);
        }}
''',
    '''        onImportNotes={(importedNotes) => {
          const nextNotes = sortNotes(importedNotes);
          notesRef.current = nextNotes;
          setNotes(nextNotes);
          void saveAllNotes(nextNotes);
          scheduleAutoSync();
        }}
''',
    'App import refs',
)
write(path, text)


# ---------------------------------------------------------------------------
# NoteEditor.tsx: read every selected file first, then perform one note update.
# A ref protects concurrent text edits while FileReader is working.
# ---------------------------------------------------------------------------
path = 'src/components/NoteEditor.tsx'
text = read(path)
text = replace_once(
    text,
    '''  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
''',
    '''  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef(note);
  noteRef.current = note;

  const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
  const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;
''',
    'NoteEditor latest note ref',
)
old_process = '''  // Handle File Upload (Image or PDF)
  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // Allow images and PDFs
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/');

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) return;

        const newAttachment: AttachmentItem = {
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          type: isPdf ? 'pdf' : isImg ? 'image' : 'other',
          mimeType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
          size: file.size,
          dataUrl,
          createdAt: Date.now(),
        };

        onUpdateNote({
          ...note,
          attachments: [...note.attachments, newAttachment],
          updatedAt: Date.now(),
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    e.target.value = '';
  };
'''
new_process = '''  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid file result'));
      reader.onerror = () => reject(reader.error || new Error('File read failed'));
      reader.readAsDataURL(file);
    });

  // Handle File Upload (Image or PDF). Build the whole batch first and update once;
  // otherwise async FileReader callbacks overwrite one another.
  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const oversized = selectedFiles.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      alert(`「${oversized.name}」は15MBを超えているため添付できません。`);
      return;
    }

    const currentTotal = noteRef.current.attachments.reduce((sum, att) => sum + att.size, 0);
    const incomingTotal = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (currentTotal + incomingTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
      alert('1つのメモに保存できる添付ファイルは合計40MBまでです。');
      return;
    }

    try {
      const newAttachments = await Promise.all(
        selectedFiles.map(async (file, index): Promise<AttachmentItem> => {
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          const isImg = file.type.startsWith('image/');
          const dataUrl = await readFileAsDataUrl(file);
          const createdAt = Date.now();

          return {
            id: `att-${createdAt}-${index}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            type: isPdf ? 'pdf' : isImg ? 'image' : 'other',
            mimeType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
            size: file.size,
            dataUrl,
            createdAt,
          };
        })
      );

      const latestNote = noteRef.current;
      onUpdateNote({
        ...latestNote,
        attachments: [...latestNote.attachments, ...newAttachments],
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Attachment read failed', err);
      alert('添付ファイルの読み込みに失敗しました。');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void processFiles(e.target.files);
    e.target.value = '';
  };
'''
text = replace_once(text, old_process, new_process, 'NoteEditor multi attachment')
text = text.replace('    processFiles(e.dataTransfer.files);', '    void processFiles(e.dataTransfer.files);')
write(path, text)


# ---------------------------------------------------------------------------
# CloudflareModal.tsx: manual sync must use the form values immediately; backup
# format is versioned; malformed arrays are rejected before touching app state.
# ---------------------------------------------------------------------------
path = 'src/components/CloudflareModal.tsx'
text = read(path)
text = replace_once(text, "import React, { useState } from 'react';", "import React, { useEffect, useState } from 'react';", 'CloudflareModal useEffect')
text = replace_once(text, "import { SAMPLE_WORKER_CODE } from '../services/cloudflareSync';\n", "import { SAMPLE_WORKER_CODE } from '../services/cloudflareSync';\nimport { normalizeNotes } from '../services/storage';\n", 'CloudflareModal validation import')
text = text.replace('  onTriggerSync: () => Promise<void>;', '  onTriggerSync: (config?: CloudflareSyncConfig) => Promise<void>;')
text = replace_once(
    text,
    '''  const [showCode, setShowCode] = useState(false);

  if (!isOpen) return null;
''',
    '''  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    if (isOpen) setFormData(config);
  }, [isOpen]);

  if (!isOpen) return null;
''',
    'CloudflareModal reopen config',
)
text = text.replace('      await onTriggerSync();', '      await onTriggerSync(formData);')
old_backup = '''  // Export local notes JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ios_notes_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import local notes JSON
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
new_backup = '''  // Export a versioned backup. Import remains backward compatible with old array-only backups.
  const handleExportJSON = () => {
    const backup = {
      format: 'memomemo-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      notes,
    };
    const dataStr =
      'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `memomemo_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(event.target?.result as string);
        const candidate =
          typeof parsed === 'object' && parsed !== null && 'notes' in parsed
            ? (parsed as { notes?: unknown }).notes
            : parsed;
        const imported = normalizeNotes(candidate);

        if (!imported) {
          alert('このJSONはMemomemoのバックアップとして読み込めません。現在のメモは変更していません。');
          return;
        }

        onImportNotes(imported);
        alert(`${imported.length} 件のメモをインポートしました。`);
      } catch {
        alert('ファイルの読み込みに失敗しました。現在のメモは変更していません。');
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
text = replace_once(text, old_backup, new_backup, 'CloudflareModal backup validation')
text = text.replace('Workers KV を使って複数端末間でメモを安全に同期', 'Workers KV を使って複数端末間でメモを同期')
text = text.replace('メモ保存時にバックグラウンドで同期します', '変更後3秒ほどで同期します')
text = text.replace('API トークン（任意 / 認証保護時）', 'API トークン（WorkerでSYNC_TOKENを設定した場合）')
write(path, text)


# ---------------------------------------------------------------------------
# RemindersModal.tsx: local timezone-safe default and truthful notification copy.
# ---------------------------------------------------------------------------
path = 'src/components/RemindersModal.tsx'
text = read(path)
text = replace_once(text, "import { requestNotificationPermission } from '../services/notifications';\n", "import { requestNotificationPermission } from '../services/notifications';\nimport { toLocalDateTimeInputValue } from '../utils/date';\n", 'Reminders date import')
text = text.replace("setTempDueDate(new Date(Date.now() + 86400000).toISOString().slice(0, 16));", "setTempDueDate(toLocalDateTimeInputValue(Date.now() + 86400000));")
text = text.replace('期日を迎えたメモやToDoタスクを自動でお知らせします。', 'アプリを開いている間、期日が近いメモやToDoタスクをお知らせします。')
text = text.replace('未完了タスク {pendingTasks.length} 件 (定期的にバックグラウンドで期限を監視しています)', '未完了タスク {pendingTasks.length} 件 (アプリを開いている間、定期的に期限を確認します)')
write(path, text)


# ---------------------------------------------------------------------------
# index.html: accessibility and product naming.
# ---------------------------------------------------------------------------
path = 'index.html'
text = read(path)
text = text.replace('width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
text = text.replace('<title>iOS Note</title>', '<title>Memomemo</title>')
text = text.replace('content="iOS Note"', 'content="Memomemo"')
text = text.replace('content="Notes"', 'content="Memomemo"')
write(path, text)

print('All audit fixes applied successfully.')
