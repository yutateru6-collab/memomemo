import { Note, CloudflareSyncConfig } from '../types';

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
    title: 'iOS Notes へようこそ 📝',
    content: `# シンプル＆高機能なメモアプリ

iPhoneの使い心地をそのままウェブで実現したミニマルなメモ帳です。

### 主な機能
- **Markdown対応**: 見出し、**太字**、*イタリック*、リスト、コードブロック
- **ToDo箇条書き**: 下のタスクリストでチェック可能
- **期限＆プッシュ通知**: やってないことを逃さずリマインド
- **タグ機能**: タグで瞬時にフィルタリング
- **オフライン対応**: IndexedDBによる完全オフライン動作
- **画像・PDF添付**: ファイルをドラッグ＆ドロップで保存
- **Cloudflare同期**: Workers KVと連携してどこからでもアクセス

\`\`\`javascript
// マークダウンコードブロックも綺麗に表示されます
console.log("Hello, iPhone Notes!");
\`\`\`
`,
    tags: ['ガイド', 'アイデア'],
    tasks: [
      { id: 'task-1', text: '新しいメモを作成してみる', completed: true },
      { id: 'task-2', text: 'チェックリストにタスクを追加する', completed: false, dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 16) },
      { id: 'task-3', text: '画像やPDFを添付してみる', completed: false },
      { id: 'task-4', text: 'Cloudflare同期を設定する', completed: false }
    ],
    attachments: [],
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
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
      { id: 'shop-2', text: 'ドリップコーヒーの豆（深煎り）', completed: false, dueDate: new Date(Date.now() + 3600000 * 4).toISOString().slice(0, 16) },
      { id: 'shop-3', text: 'キッチンペーパーと洗剤', completed: false }
    ],
    attachments: [],
    dueDate: new Date(Date.now() + 3600000 * 5).toISOString().slice(0, 16),
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

export async function saveNote(note: Note): Promise<void> {
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
