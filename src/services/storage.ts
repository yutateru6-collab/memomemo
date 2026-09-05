import { Note, CloudflareSyncConfig, TaskItem, AttachmentItem } from '../types';
import { toLocalDateTimeInputValue } from '../utils/date';

const DB_NAME = 'ios_notes_db';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

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
const INITIAL_NOTES: Note[] = [
  {
    id: 'sample-welcome',
    title: 'Memomemo へようこそ 📝',
    content: `# シンプル＆高機能なメモアプリ

端末内保存を中心に、すばやく書いて整理できるミニマルなメモ帳です。

### 主な機能
- **Markdown対応**: 見出し、**太字**、*イタリック*、リスト、コードブロック
- **ToDo箇条書き**: 下のタスクリストでチェック可能
- **期限＆通知**: アプリを開いている間、期限が近い項目をリマインド
- **タグ機能**: タグで瞬時にフィルタリング
- **端末内保存**: IndexedDBにメモを保存
- **画像・PDF添付**: ファイルをドラッグ＆ドロップで保存
- **Cloudflare同期**: Workers KVと連携してどこからでもアクセス

\`\`\`javascript
// マークダウンコードブロックも綺麗に表示されます
console.log("Hello, Memomemo!");
\`\`\`
`,
    tags: ['ガイド', 'アイデア'],
    tasks: [
      { id: 'task-1', text: '新しいメモを作成してみる', completed: true },
      { id: 'task-2', text: 'チェックリストにタスクを追加する', completed: false, dueDate: toLocalDateTimeInputValue(Date.now() + 86400000) },
      { id: 'task-3', text: '画像やPDFを添付してみる', completed: false },
      { id: 'task-4', text: 'Cloudflare同期を設定する', completed: false }
    ],
    attachments: [],
    dueDate: toLocalDateTimeInputValue(Date.now() + 86400000),
    reminderActive: true,
    isPinned: true,
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 1800000,
    version: 1,
  },
  {
    id: 'sample-shopping',
    title: '週末の買い物リスト 🛒',
    content: `今週の週末に買い出しに行く食材と日用品リスト。

> 買い忘れがないように事前に整理しておく。`,
    tags: ['買い物', 'ToDo'],
    tasks: [
      { id: 'shop-1', text: '牛乳と低脂肪ヨーグルト', completed: true },
      { id: 'shop-2', text: 'ドリップコーヒーの豆（深煎り）', completed: false, dueDate: toLocalDateTimeInputValue(Date.now() + 3600000 * 4) },
      { id: 'shop-3', text: 'キッチンペーパーと洗剤', completed: false }
    ],
    attachments: [],
    dueDate: toLocalDateTimeInputValue(Date.now() + 3600000 * 5),
    reminderActive: true,
    isPinned: false,
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
    version: 1,
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
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

export async function getAllNotes(): Promise<Note[]> {
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

export async function saveNote(note: Note): Promise<void> {
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

// Cloudflare Configuration Storage
const CLOUDFLARE_CONFIG_KEY = 'ios_notes_cloudflare_config';

export const DEFAULT_CF_CONFIG: CloudflareSyncConfig = {
  workerUrl: '',
  apiToken: '',
  kvNamespace: 'NOTES_KV',
  autoSync: false,
  lastSyncTime: null,
  status: 'idle',
  errorMessage: null,
};

export function getCloudflareConfig(): CloudflareSyncConfig {
  try {
    const saved = localStorage.getItem(CLOUDFLARE_CONFIG_KEY);
    if (saved) {
      return { ...DEFAULT_CF_CONFIG, ...JSON.parse(saved) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_CF_CONFIG;
}

export function saveCloudflareConfig(config: CloudflareSyncConfig): void {
  try {
    localStorage.setItem(CLOUDFLARE_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save Cloudflare config', err);
  }
}
