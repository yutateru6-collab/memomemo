import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, School, StickyNote } from 'lucide-react';
import App from './App';
import { CalendarView } from './components/CalendarView';
import { SchoolView } from './components/SchoolView';
import { Note } from './types';
import {
  deleteNote,
  getAllNotes,
  getCloudflareConfig,
  saveAllNotes,
  saveNote,
} from './services/storage';
import { mergeNotesWithCloudState, syncWithCloudflare } from './services/cloudflareSync';
import { recordNoteDeletion } from './services/cloudVault';
import { SchoolClassId } from './services/schoolData';

export type AppSection = 'notes' | 'school' | 'calendar';

export default function AppShell() {
  const [section, setSection] = useState<AppSection>('notes');
  const [managedNotes, setManagedNotes] = useState<Note[]>([]);
  const [isManagedLoaded, setIsManagedLoaded] = useState(false);
  const [schoolClassId, setSchoolClassId] = useState<SchoolClassId>('2-3');
  const [schoolLessonId, setSchoolLessonId] = useState<string | null>(null);
  const managedNotesRef = useRef<Note[]>([]);
  const syncTimerRef = useRef<number | null>(null);

  const applyManagedNotes = useCallback((notes: Note[]) => {
    managedNotesRef.current = notes;
    setManagedNotes(notes);
  }, []);

  const reloadManagedNotes = useCallback(async () => {
    setIsManagedLoaded(false);
    try {
      const notes = await getAllNotes();
      applyManagedNotes(notes);
    } finally {
      setIsManagedLoaded(true);
    }
  }, [applyManagedNotes]);

  useEffect(() => {
    if (section === 'notes') return;
    void reloadManagedNotes();
  }, [reloadManagedNotes, section]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    };
  }, []);

  const scheduleCloudSync = useCallback(() => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(async () => {
      syncTimerRef.current = null;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const config = getCloudflareConfig();
      if (!config.autoSync || !config.syncCode || !config.workerUrl.trim()) return;

      const result = await syncWithCloudflare(managedNotesRef.current, config);
      if (!result.success || !result.remoteNotes) return;

      const merged = mergeNotesWithCloudState(
        managedNotesRef.current,
        result.remoteNotes,
        result.remoteTombstones || []
      );
      applyManagedNotes(merged);
      try {
        await saveAllNotes(merged);
      } catch (err) {
        console.warn('Failed to persist managed sync result', err);
      }
    }, 1200);
  }, [applyManagedNotes]);

  const handleSaveSchoolNote = useCallback(
    (note: Note) => {
      const current = managedNotesRef.current;
      const exists = current.some((item) => item.id === note.id);
      const next = exists
        ? current.map((item) => (item.id === note.id ? note : item))
        : [note, ...current];
      applyManagedNotes(next);
      void saveNote(note).catch((err) => console.error('School note save failed', err));
      scheduleCloudSync();
    },
    [applyManagedNotes, scheduleCloudSync]
  );

  const handleDeleteSchoolNote = useCallback(
    (note: Note) => {
      const next = managedNotesRef.current.filter((item) => item.id !== note.id);
      applyManagedNotes(next);
      recordNoteDeletion(note);
      void deleteNote(note.id).catch((err) => console.error('School note delete failed', err));
      scheduleCloudSync();
    },
    [applyManagedNotes, scheduleCloudSync]
  );

  const openSection = (nextSection: AppSection) => {
    setSection(nextSection);
    if (nextSection !== 'notes') void reloadManagedNotes();
  };

  return (
    <div className={`app-shell app-shell-${section} h-[100dvh] overflow-hidden bg-[#f2f2f7] dark:bg-black`}>
      <main className="h-full overflow-hidden">
        {section === 'notes' ? (
          <App />
        ) : !isManagedLoaded ? (
          <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-400">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <span className="text-sm">読み込み中...</span>
            </div>
          </div>
        ) : section === 'school' ? (
          <SchoolView
            notes={managedNotes}
            selectedClassId={schoolClassId}
            selectedLessonId={schoolLessonId}
            onSelectClass={setSchoolClassId}
            onSelectLesson={setSchoolLessonId}
            onSaveNote={handleSaveSchoolNote}
            onDeleteNote={handleDeleteSchoolNote}
          />
        ) : (
          <CalendarView
            notes={managedNotes}
            onOpenSchoolLesson={(classId, noteId) => {
              setSchoolClassId(classId);
              setSchoolLessonId(noteId);
              setSection('school');
            }}
          />
        )}
      </main>

      <nav className="app-shell-tabbar fixed z-[70] left-1/2 -translate-x-1/2 bottom-0 w-full max-w-[520px] border-t border-neutral-200/90 dark:border-neutral-800/90 bg-white/94 dark:bg-[#111113]/94 backdrop-blur-xl px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-3 gap-1">
          <TabButton
            active={section === 'notes'}
            label="メモ"
            testId="app-tab-notes"
            icon={<StickyNote className="w-5 h-5" />}
            onClick={() => openSection('notes')}
          />
          <TabButton
            active={section === 'school'}
            label="学校"
            testId="app-tab-school"
            icon={<School className="w-5 h-5" />}
            onClick={() => openSection('school')}
          />
          <TabButton
            active={section === 'calendar'}
            label="カレンダー"
            testId="app-tab-calendar"
            icon={<CalendarDays className="w-5 h-5" />}
            onClick={() => openSection('calendar')}
          />
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
  testId,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`min-h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
        active
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
