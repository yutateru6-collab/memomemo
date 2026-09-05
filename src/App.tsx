import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Note, AttachmentItem, FilterState, CloudflareSyncConfig, ThemeMode } from './types';
import {
  getAllNotes,
  saveNote,
  deleteNote as deleteNoteStorage,
  getCloudflareConfig,
  saveCloudflareConfig,
  DEFAULT_CF_CONFIG,
  saveAllNotes,
  sortNotes
} from './services/storage';
import { syncWithCloudflare } from './services/cloudflareSync';
import { checkReminders } from './services/notifications';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { CloudflareModal } from './components/CloudflareModal';
import { RemindersModal } from './components/RemindersModal';
import { AttachmentViewer } from './components/AttachmentViewer';
import { Smartphone, Monitor, Bell, X, CheckCircle2 } from 'lucide-react';

export default function App() {
  // State
  const [notes, setNotes] = useState<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Appearance & Frame
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [isIPhoneFrame, setIsIPhoneFrame] = useState<boolean>(false);

  // Filters
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedTag: null,
    showOnlyPendingTasks: false,
    showOnlyWithAttachments: false,
  });

  // Cloudflare & Modals
  const [cfConfig, setCfConfig] = useState<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);
  const cfConfigRef = useRef<CloudflareSyncConfig>(DEFAULT_CF_CONFIG);
  const [isCloudflareModalOpen, setIsCloudflareModalOpen] = useState<boolean>(false);
  const [isRemindersModalOpen, setIsRemindersModalOpen] = useState<boolean>(false);
  const [activeAttachment, setActiveAttachment] = useState<AttachmentItem | null>(null);

  // In-app alert banner
  const [inAppAlert, setInAppAlert] = useState<{ title: string; body: string } | null>(null);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Theme effect
  useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  // Initial Load from IndexedDB
  useEffect(() => {
    async function loadData() {
      try {
        const loadedNotes = await getAllNotes();
        notesRef.current = loadedNotes;
        setNotes(loadedNotes);
        const config = getCloudflareConfig();
        cfConfigRef.current = config;
        setCfConfig(config);
        setIsLoaded(true);
      } catch (err) {
        console.error('Failed to load initial notes', err);
        setIsLoaded(true);
      }
    }
    loadData();
  }, []);

  // Periodic Reminder Checker
  useEffect(() => {
    if (!isLoaded || notes.length === 0) return;

    const runCheck = () => {
      checkReminders(notes, (title, body) => {
        setInAppAlert({ title, body });
      });
    };

    runCheck();
    const interval = setInterval(runCheck, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [notes, isLoaded]);

  // Debounced auto-sync to Cloudflare. Refs are the authoritative snapshots so
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

  // Create New Note
  const handleCreateNewNote = () => {
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: '新規メモ',
      content: '',
      tags: [],
      tasks: [],
      attachments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    const nextNotes = sortNotes([newNote, ...notesRef.current]);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    setSelectedNoteId(newNote.id);
    void saveNote(newNote);
    scheduleAutoSync();
  };

  // Delete Note
  const handleDeleteNote = async (noteId: string) => {
    await deleteNoteStorage(noteId);
    const nextNotes = notesRef.current.filter((n) => n.id !== noteId);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
    scheduleAutoSync();
  };

  // Quick Toggle task from Reminders Modal
  const handleToggleTask = (noteId: string, taskId: string) => {
    const targetNote = notesRef.current.find((n) => n.id === noteId);
    if (!targetNote) return;

    const updatedNote: Note = {
      ...targetNote,
      tasks: targetNote.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      ),
      updatedAt: Date.now(),
    };
    handleUpdateNote(updatedNote);
  };

  // Quick Update task due date from Reminders Modal
  const handleUpdateTaskDueDate = (noteId: string, taskId: string, dueDate: string) => {
    const targetNote = notesRef.current.find((n) => n.id === noteId);
    if (!targetNote) return;

    const updatedNote: Note = {
      ...targetNote,
      tasks: targetNote.tasks.map((t) =>
        t.id === taskId ? { ...t, dueDate: dueDate || undefined } : t
      ),
      updatedAt: Date.now(),
    };
    handleUpdateNote(updatedNote);
  };

  // All distinct tags across all notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((note) => {
      note.tags.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Total pending tasks count across all notes
  const totalPendingTasksCount = useMemo(() => {
    return notes.reduce((acc, note) => {
      return acc + note.tasks.filter((t) => !t.completed).length;
    }, 0);
  }, [notes]);

  const selectedNote = useMemo(() => {
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-100 dark:bg-black text-neutral-500 text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <span>メモを読み込み中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-neutral-200 dark:bg-neutral-950 flex flex-col items-center justify-center relative font-sans transition-colors duration-200">
      {/* Top Floating Control Bar (Desktop Mode Switcher & Guide) */}
      <div className="hidden sm:flex w-full max-w-5xl px-4 py-2 items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
            Memomemo
          </span>
          <span className="hidden sm:inline text-neutral-400">•</span>
          <span className="hidden sm:inline text-[11px]">
            {isOnline ? '🟢 オンライン' : '🔌 オフライン'}
          </span>
        </div>

        {/* View Mode Toggle (iPhone Frame vs Fullscreen) */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-iphone-frame-btn"
            type="button"
            onClick={() => setIsIPhoneFrame(!isIPhoneFrame)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-neutral-800 shadow-xs border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors"
          >
            {isIPhoneFrame ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-medium">全画面表示</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-medium">iPhone外枠表示</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* In-App Notification / Reminder Toast Banner */}
      {inAppAlert && (
        <div
          id="in-app-alert-banner"
          className="fixed top-4 z-50 max-w-md w-[92%] bg-neutral-900/95 dark:bg-[#1c1c1e]/95 text-white p-3.5 rounded-2xl shadow-2xl border border-amber-500/40 flex items-start justify-between gap-3 animate-in slide-in-from-top duration-200 backdrop-blur-md"
        >
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-full bg-amber-500 text-black mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-400">{inAppAlert.title}</p>
              <p className="text-[11px] text-neutral-300 mt-0.5 leading-snug">
                {inAppAlert.body}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInAppAlert(null)}
            className="p-1 rounded-full text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Container: Either iPhone Shell or Fluid Master-Detail Responsive Layout */}
      <div
        className={`w-full transition-all duration-300 flex justify-center ${
          isIPhoneFrame
            ? 'max-w-[420px] h-[860px] max-h-[92vh] my-2'
            : 'max-w-5xl h-[100dvh] sm:h-[92vh] my-0 sm:my-2 px-0 sm:px-4'
        }`}
      >
        {/* The Frame / Chassis */}
        <div
          className={`w-full h-full flex flex-col overflow-hidden bg-white dark:bg-[#000000] text-neutral-900 dark:text-neutral-100 ${
            isIPhoneFrame
              ? 'rounded-[48px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border-[10px] border-neutral-800 dark:border-neutral-800 ring-1 ring-neutral-700/50 relative'
              : 'rounded-2xl sm:rounded-3xl shadow-xl border border-neutral-300 dark:border-neutral-800'
          }`}
        >
          {/* iPhone Dynamic Island / Notch Mockup (Only visible in iPhone Frame mode) */}
          {isIPhoneFrame && (
            <div className="w-full bg-[#f2f2f7] dark:bg-black pt-3 pb-1 px-6 flex items-center justify-between text-[11px] font-semibold tracking-tight text-neutral-800 dark:text-neutral-200 shrink-0 z-30 select-none">
              <span>9:41</span>
              <div className="w-24 h-5 bg-black rounded-full mx-auto" />
              <div className="flex items-center gap-1.5 text-xs">
                <span>5G</span>
                <div className="w-5 h-2.5 border border-current rounded-xs p-0.5 flex items-center">
                  <div className="w-full h-full bg-current rounded-2xs" />
                </div>
              </div>
            </div>
          )}

          {/* Core App Views: Fluid iOS Navigation */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* On Small Screens or iPhone Frame: Single view sliding transition */}
            {isIPhoneFrame ? (
              // Mobile View inside Frame: Slide between List and Editor
              selectedNote ? (
                <NoteEditor
                  note={selectedNote}
                  allExistingTags={allTags}
                  onUpdateNote={handleUpdateNote}
                  onDeleteNote={handleDeleteNote}
                  onBack={() => setSelectedNoteId(null)}
                  onOpenAttachment={(att) => setActiveAttachment(att)}
                />
              ) : (
                <NoteList
                  notes={notes}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={(note) => setSelectedNoteId(note.id)}
                  onCreateNewNote={handleCreateNewNote}
                  filters={filters}
                  onUpdateFilters={setFilters}
                  allTags={allTags}
                  cfConfig={cfConfig}
                  onOpenCloudflareModal={() => setIsCloudflareModalOpen(true)}
                  onOpenRemindersModal={() => setIsRemindersModalOpen(true)}
                  themeMode={themeMode}
                  onToggleTheme={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
                  isOnline={isOnline}
                  totalPendingTasksCount={totalPendingTasksCount}
                />
              )
            ) : (
              // Desktop / Tablet Fullscreen: Adaptive Split View (Side-by-side on md+, Single view on mobile)
              <div className="flex-1 flex w-full h-full overflow-hidden">
                {/* Note List Sidebar / View */}
                <div
                  className={`h-full border-r border-neutral-200 dark:border-neutral-800 transition-all duration-200 ${
                    selectedNote
                      ? 'hidden md:flex md:w-80 lg:w-96 flex-col'
                      : 'flex flex-col w-full'
                  }`}
                >
                  <NoteList
                    notes={notes}
                    selectedNoteId={selectedNoteId}
                    onSelectNote={(note) => setSelectedNoteId(note.id)}
                    onCreateNewNote={handleCreateNewNote}
                    filters={filters}
                    onUpdateFilters={setFilters}
                    allTags={allTags}
                    cfConfig={cfConfig}
                    onOpenCloudflareModal={() => setIsCloudflareModalOpen(true)}
                    onOpenRemindersModal={() => setIsRemindersModalOpen(true)}
                    themeMode={themeMode}
                    onToggleTheme={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
                    isOnline={isOnline}
                    totalPendingTasksCount={totalPendingTasksCount}
                  />
                </div>

                {/* Note Editor Area */}
                <div
                  className={`h-full flex-1 flex flex-col ${
                    !selectedNote ? 'hidden md:flex' : 'flex w-full'
                  }`}
                >
                  {selectedNote ? (
                    <NoteEditor
                      note={selectedNote}
                      allExistingTags={allTags}
                      onUpdateNote={handleUpdateNote}
                      onDeleteNote={handleDeleteNote}
                      onBack={() => setSelectedNoteId(null)}
                      onOpenAttachment={(att) => setActiveAttachment(att)}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-400 select-none bg-white dark:bg-[#1c1c1e]">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                        <Smartphone className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                        メモを選択してください
                      </p>
                      <p className="text-xs text-neutral-400 mt-1 max-w-xs text-center">
                        左の一覧からメモを選ぶか、新規作成ボタンで新しいメモを作成できます。
                      </p>
                      <button
                        type="button"
                        onClick={handleCreateNewNote}
                        className="mt-4 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold shadow-xs transition-colors"
                      >
                        + 新規メモを作成
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* iPhone Home Indicator bar (when in frame mode) */}
          {isIPhoneFrame && (
            <div className="w-full bg-[#f2f2f7] dark:bg-[#1c1c1e] py-2 flex justify-center shrink-0 z-30 select-none">
              <div className="w-32 h-1 bg-neutral-400 dark:bg-neutral-600 rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Cloudflare Modal */}
      <CloudflareModal
        isOpen={isCloudflareModalOpen}
        onClose={() => setIsCloudflareModalOpen(false)}
        config={cfConfig}
        onSaveConfig={(updated) => {
          cfConfigRef.current = updated;
          setCfConfig(updated);
          saveCloudflareConfig(updated);
        }}
        onTriggerSync={(configOverride) => triggerCloudflareSync(notesRef.current, configOverride)}
        notes={notes}
        onImportNotes={(importedNotes) => {
          const nextNotes = sortNotes(importedNotes);
          notesRef.current = nextNotes;
          setNotes(nextNotes);
          void saveAllNotes(nextNotes);
          scheduleAutoSync();
        }}
      />

      {/* Reminders & Unfinished Tasks Modal */}
      <RemindersModal
        isOpen={isRemindersModalOpen}
        onClose={() => setIsRemindersModalOpen(false)}
        notes={notes}
        onToggleTask={handleToggleTask}
        onSelectNote={(note) => {
          setSelectedNoteId(note.id);
        }}
        onUpdateTaskDueDate={handleUpdateTaskDueDate}
      />

      {/* Attachment Viewer Lightbox */}
      <AttachmentViewer
        attachment={activeAttachment}
        onClose={() => setActiveAttachment(null)}
      />
    </div>
  );
}
