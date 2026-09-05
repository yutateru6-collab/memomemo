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
  createdAt: number;
  updatedAt: number;
  version: number;
}

export interface CloudflareSyncConfig {
  workerUrl: string;
  apiToken: string;
  kvNamespace: string;
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
