export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string; // ISO string e.g. "2026-09-05T10:00"
}

export interface AttachmentItem {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'other';
  mimeType: string;
  size: number;
  dataUrl: string; // Base64 data string for offline IndexedDB persistence
  createdAt: number;
}

export interface Note {
  id: string;
  title: string;
  content: string; // Markdown formatted body
  tags: string[];
  tasks: TaskItem[];
  attachments: AttachmentItem[];
  dueDate?: string; // ISO string for reminder/deadline
  reminderActive?: boolean;
  isPinned?: boolean;
  /** Timestamp when the note was moved to Trash. Missing means active. */
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface CloudflareSyncConfig {
  /** Sync endpoint. Production defaults to the same-origin /api/sync route. */
  workerUrl: string;
  /** Legacy field retained for existing localStorage migrations. Not used by encrypted sync v2. */
  apiToken: string;
  /** Legacy field retained for existing localStorage migrations. Binding is configured server-side. */
  kvNamespace: string;
  /** 256-bit client-side secret. Cloudflare never receives this raw value. */
  syncCode: string;
  autoSync: boolean;
  lastSyncTime: number | null;
  status: 'idle' | 'syncing' | 'success' | 'error';
  errorMessage: string | null;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface FilterState {
  searchQuery: string;
  selectedTag: string | null;
  showOnlyPendingTasks: boolean;
  showOnlyWithAttachments: boolean;
}
