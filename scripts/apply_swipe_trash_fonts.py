from pathlib import Path

# ---------- types.ts ----------
p = Path('src/types.ts')
s = p.read_text()
old = "  isPinned?: boolean;\n  createdAt: number;"
new = "  isPinned?: boolean;\n  /** Timestamp when the note was moved to Trash. Missing means active. */\n  trashedAt?: number;\n  createdAt: number;"
if old not in s:
    raise SystemExit('types Note marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# ---------- noteValidation.ts ----------
p = Path('src/services/noteValidation.ts')
s = p.read_text()
old = "  if (value.isPinned !== undefined && typeof value.isPinned !== 'boolean') return null;\n"
new = old + "  if (value.trashedAt !== undefined && !isFiniteNumber(value.trashedAt)) return null;\n"
if old not in s:
    raise SystemExit('note validation optional fields marker not found')
s = s.replace(old, new, 1)
old = "    ...(value.isPinned !== undefined ? { isPinned: value.isPinned as boolean } : {}),\n    createdAt: value.createdAt,"
new = "    ...(value.isPinned !== undefined ? { isPinned: value.isPinned as boolean } : {}),\n    ...(value.trashedAt !== undefined ? { trashedAt: value.trashedAt as number } : {}),\n    createdAt: value.createdAt,"
if old not in s:
    raise SystemExit('note validation return marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# ---------- shared trash policy ----------
Path('src/services/trash.ts').write_text("""import { Note } from '../types';

export const TRASH_RETENTION_MS = 60 * 60 * 1000;

export function isNoteTrashed(note: Note): boolean {
  return typeof note.trashedAt === 'number';
}

export function isTrashExpired(note: Note, now: number = Date.now()): boolean {
  return typeof note.trashedAt === 'number' && now - note.trashedAt >= TRASH_RETENTION_MS;
}

export function trashRemainingMs(note: Note, now: number = Date.now()): number {
  if (typeof note.trashedAt !== 'number') return TRASH_RETENTION_MS;
  return Math.max(0, TRASH_RETENTION_MS - (now - note.trashedAt));
}
""")

# ---------- TrashModal.tsx ----------
Path('src/components/TrashModal.tsx').write_text("""import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, RotateCcw, Trash2, X } from 'lucide-react';
import { Note } from '../types';
import { trashRemainingMs } from '../services/trash';

interface TrashModalProps {
  isOpen: boolean;
  notes: Note[];
  onClose: () => void;
  onRestore: (noteId: string) => void;
  onDeletePermanently: (noteId: string) => void;
}

function remainingLabel(ms: number): string {
  if (ms <= 0) return 'まもなく完全削除';
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `あと ${totalSeconds}秒`;
  const minutes = Math.ceil(totalSeconds / 60);
  return `あと ${minutes}分`;
}

export const TrashModal: React.FC<TrashModalProps> = ({
  isOpen,
  notes,
  onClose,
  onRestore,
  onDeletePermanently,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0)),
    [notes]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] modal-safe-backdrop bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div
        id="trash-modal-content"
        className="w-full sm:max-w-lg max-h-[82dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#f2f2f7] dark:bg-[#111113] border border-neutral-200/70 dark:border-neutral-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-[#1c1c1e]/95">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-full bg-rose-500/12 text-rose-500 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">ゴミ箱</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">入れてから1時間で自動的に完全削除</p>
            </div>
          </div>
          <button
            id="close-trash-modal-btn"
            type="button"
            onClick={onClose}
            className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            aria-label="ゴミ箱を閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-safe">
          {sortedNotes.length === 0 ? (
            <div className="py-14 text-center text-neutral-500 dark:text-neutral-400">
              <Trash2 className="w-9 h-9 mx-auto mb-3 opacity-45" />
              <p className="text-base font-semibold">ゴミ箱は空です</p>
              <p className="text-sm mt-1">メモを左へスワイプすると、ここへ移動します。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedNotes.map((note) => {
                const remaining = trashRemainingMs(note, now);
                return (
                  <div
                    key={note.id}
                    data-trash-note-id={note.id}
                    className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200/70 dark:border-neutral-800 p-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-neutral-900 dark:text-white truncate">
                          {note.title || '無題のメモ'}
                        </h3>
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-rose-500 dark:text-rose-400 font-medium">
                          <Clock3 className="w-4 h-4" />
                          <span>{remainingLabel(remaining)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button
                        type="button"
                        data-restore-note-id={note.id}
                        onClick={() => onRestore(note.id)}
                        className="min-h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-sm font-semibold flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        復元
                      </button>
                      <button
                        type="button"
                        data-delete-now-note-id={note.id}
                        onClick={() => {
                          if (confirm('このメモを今すぐ完全に削除しますか？元に戻せません。')) {
                            onDeletePermanently(note.id);
                          }
                        }}
                        className="min-h-11 rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400 text-sm font-semibold flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        今すぐ削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
""")

# ---------- App.tsx ----------
p = Path('src/App.tsx')
s = p.read_text()
s = s.replace(
    "import { AttachmentViewer } from './components/AttachmentViewer';",
    "import { AttachmentViewer } from './components/AttachmentViewer';\nimport { TrashModal } from './components/TrashModal';",
    1,
)
s = s.replace(
    "import { recordNoteDeletion } from './services/cloudVault';",
    "import { recordNoteDeletion } from './services/cloudVault';\nimport { TRASH_RETENTION_MS } from './services/trash';",
    1,
)
old = "  const [isRemindersModalOpen, setIsRemindersModalOpen] = useState<boolean>(false);\n  const [activeAttachment, setActiveAttachment] = useState<AttachmentItem | null>(null);"
new = "  const [isRemindersModalOpen, setIsRemindersModalOpen] = useState<boolean>(false);\n  const [isTrashModalOpen, setIsTrashModalOpen] = useState<boolean>(false);\n  const [activeAttachment, setActiveAttachment] = useState<AttachmentItem | null>(null);"
if old not in s:
    raise SystemExit('App modal state marker not found')
s = s.replace(old, new, 1)
s = s.replace("      checkReminders(notes, (title, body) => {", "      checkReminders(notes.filter((note) => !note.trashedAt), (title, body) => {", 1)

old_delete = """  // Delete Note. Record a versioned tombstone only after local deletion succeeds.
  const handleDeleteNote = async (noteId: string) => {
    const noteToDelete = notesRef.current.find((note) => note.id === noteId);
    try {
      await deleteNoteStorage(noteId);
    } catch (err) {
      reportStorageError('メモ削除', err);
      return;
    }

    if (noteToDelete) recordNoteDeletion(noteToDelete);
    const nextNotes = notesRef.current.filter((n) => n.id !== noteId);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
    }
    scheduleAutoSync();
  };
"""
new_delete = """  // Normal delete is reversible: move the note to Trash first.
  const handleDeleteNote = (noteId: string) => {
    const noteToTrash = notesRef.current.find((note) => note.id === noteId);
    if (!noteToTrash || noteToTrash.trashedAt) return;

    const now = Date.now();
    const trashedNote: Note = {
      ...noteToTrash,
      isPinned: false,
      trashedAt: now,
      updatedAt: now,
      version: Math.max(1, (noteToTrash.version || 1) + 1),
    };
    const nextNotes = notesRef.current.map((note) =>
      note.id === noteId ? trashedNote : note
    );
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    if (selectedNoteId === noteId) setSelectedNoteId(null);
    void saveNote(trashedNote).catch((err) => reportStorageError('ゴミ箱への移動', err));
    scheduleAutoSync();
  };

  const handleRestoreNote = (noteId: string) => {
    const trashedNote = notesRef.current.find((note) => note.id === noteId && note.trashedAt);
    if (!trashedNote) return;
    const now = Date.now();
    const restoredNote: Note = {
      ...trashedNote,
      trashedAt: undefined,
      updatedAt: now,
      version: Math.max(1, (trashedNote.version || 1) + 1),
    };
    const nextNotes = notesRef.current.map((note) =>
      note.id === noteId ? restoredNote : note
    );
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    void saveNote(restoredNote).catch((err) => reportStorageError('メモ復元', err));
    scheduleAutoSync();
  };

  // Permanent deletion is used only from Trash or after the one-hour retention window.
  const handlePermanentDeleteNote = async (noteId: string) => {
    const noteToDelete = notesRef.current.find((note) => note.id === noteId);
    try {
      await deleteNoteStorage(noteId);
    } catch (err) {
      reportStorageError('メモ完全削除', err);
      return false;
    }

    if (noteToDelete) recordNoteDeletion(noteToDelete);
    const nextNotes = notesRef.current.filter((note) => note.id !== noteId);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    if (selectedNoteId === noteId) setSelectedNoteId(null);
    scheduleAutoSync();
    return true;
  };

  // Trash is self-cleaning. Schedule the next exact expiry instead of polling constantly.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    let timer: number | undefined;

    const purgeAndSchedule = async () => {
      if (cancelled) return;
      const now = Date.now();
      const expired = notesRef.current.filter(
        (note) => typeof note.trashedAt === 'number' && now - note.trashedAt >= TRASH_RETENTION_MS
      );

      if (expired.length > 0) {
        const removedIds = new Set<string>();
        for (const note of expired) {
          try {
            await deleteNoteStorage(note.id);
            recordNoteDeletion(note);
            removedIds.add(note.id);
          } catch (err) {
            reportStorageError('ゴミ箱の自動削除', err);
          }
        }
        if (removedIds.size > 0) {
          const nextNotes = notesRef.current.filter((note) => !removedIds.has(note.id));
          notesRef.current = nextNotes;
          setNotes(nextNotes);
          scheduleAutoSync();
        }
      }

      const nextExpiry = notesRef.current
        .filter((note) => typeof note.trashedAt === 'number')
        .map((note) => (note.trashedAt as number) + TRASH_RETENTION_MS)
        .sort((a, b) => a - b)[0];

      if (nextExpiry) {
        const delay = Math.max(500, nextExpiry - Date.now() + 100);
        timer = window.setTimeout(() => void purgeAndSchedule(), delay);
      }
    };

    void purgeAndSchedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [isLoaded, notes, reportStorageError, scheduleAutoSync]);
"""
if old_delete not in s:
    raise SystemExit('App delete handler marker not found')
s = s.replace(old_delete, new_delete, 1)

old = "  // All distinct tags across all notes\n  const allTags = useMemo(() => {\n    const tagSet = new Set<string>();\n    notes.forEach((note) => {"
new = "  const activeNotes = useMemo(() => notes.filter((note) => !note.trashedAt), [notes]);\n  const trashNotes = useMemo(() => notes.filter((note) => !!note.trashedAt), [notes]);\n\n  // All distinct tags across active notes\n  const allTags = useMemo(() => {\n    const tagSet = new Set<string>();\n    activeNotes.forEach((note) => {"
if old not in s:
    raise SystemExit('App allTags marker not found')
s = s.replace(old, new, 1)
s = s.replace("  }, [notes]);\n\n  // Total pending tasks count across all notes", "  }, [activeNotes]);\n\n  // Total pending tasks count across active notes", 1)
s = s.replace("    return notes.reduce((acc, note) => {", "    return activeNotes.reduce((acc, note) => {", 1)
s = s.replace("  }, [notes]);\n\n  const selectedNote = useMemo(() => {\n    return notes.find((n) => n.id === selectedNoteId) || null;\n  }, [notes, selectedNoteId]);", "  }, [activeNotes]);\n\n  const selectedNote = useMemo(() => {\n    return activeNotes.find((n) => n.id === selectedNoteId) || null;\n  }, [activeNotes, selectedNoteId]);", 1)

# Both NoteList instances should receive only active notes and trash actions.
s = s.replace("                  notes={notes}\n                  selectedNoteId={selectedNoteId}", "                  notes={activeNotes}\n                  selectedNoteId={selectedNoteId}", 1)
s = s.replace("                    notes={notes}\n                    selectedNoteId={selectedNoteId}", "                    notes={activeNotes}\n                    selectedNoteId={selectedNoteId}", 1)
s = s.replace("                  onCreateNewNote={handleCreateNewNote}\n                  filters={filters}", "                  onCreateNewNote={handleCreateNewNote}\n                  onMoveToTrash={handleDeleteNote}\n                  onOpenTrashModal={() => setIsTrashModalOpen(true)}\n                  trashCount={trashNotes.length}\n                  filters={filters}", 1)
s = s.replace("                    onCreateNewNote={handleCreateNewNote}\n                    filters={filters}", "                    onCreateNewNote={handleCreateNewNote}\n                    onMoveToTrash={handleDeleteNote}\n                    onOpenTrashModal={() => setIsTrashModalOpen(true)}\n                    trashCount={trashNotes.length}\n                    filters={filters}", 1)
s = s.replace("        notes={notes}\n        onToggleTask={handleToggleTask}", "        notes={activeNotes}\n        onToggleTask={handleToggleTask}", 1)

# Insert Trash modal before reminders modal.
marker = "      {/* Reminders & Unfinished Tasks Modal */}\n"
trash_modal = """      <TrashModal
        isOpen={isTrashModalOpen}
        notes={trashNotes}
        onClose={() => setIsTrashModalOpen(false)}
        onRestore={handleRestoreNote}
        onDeletePermanently={(noteId) => void handlePermanentDeleteNote(noteId)}
      />

"""
if marker not in s:
    raise SystemExit('App reminders modal marker not found')
s = s.replace(marker, trash_modal + marker, 1)
p.write_text(s)

# ---------- NoteEditor.tsx ----------
p = Path('src/components/NoteEditor.tsx')
s = p.read_text()
s = s.replace("if (confirm('このメモを削除しますか？')) onDeleteNote(note.id);", "if (confirm('このメモをゴミ箱に移動しますか？1時間以内なら復元できます。')) onDeleteNote(note.id);", 1)
s = s.replace("                  メモを削除\n", "                  ゴミ箱に移動\n", 1)
s = s.replace("font-semibold text-sm hover:opacity-80", "font-semibold text-base hover:opacity-80", 1)
s = s.replace("rounded-xl text-sm font-semibold text-amber-700", "rounded-xl text-base font-semibold text-amber-700", 1)
s = s.replace("w-full min-h-11 px-4 flex items-center gap-3 text-sm text-left", "w-full min-h-11 px-4 flex items-center gap-3 text-base text-left")
p.write_text(s)

# ---------- NoteList.tsx ----------
p = Path('src/components/NoteList.tsx')
s = p.read_text()
s = s.replace("  X,\n  Pin,", "  X,\n  Trash2,\n  Pin,", 1)
old = "  onCreateNewNote: () => void;\n  filters: FilterState;"
new = "  onCreateNewNote: () => void;\n  onMoveToTrash: (noteId: string) => void;\n  onOpenTrashModal: () => void;\n  trashCount: number;\n  filters: FilterState;"
if old not in s:
    raise SystemExit('NoteList props marker not found')
s = s.replace(old, new, 1)
old = "  onCreateNewNote,\n  filters,"
new = "  onCreateNewNote,\n  onMoveToTrash,\n  onOpenTrashModal,\n  trashCount,\n  filters,"
if old not in s:
    raise SystemExit('NoteList destructure marker not found')
s = s.replace(old, new, 1)

insert_marker = ") => {\n  // Filter logic"
swipe_helpers = """) => {
  const [swipeOffsets, setSwipeOffsets] = React.useState<Record<string, number>>({});
  const [activeSwipeNoteId, setActiveSwipeNoteId] = React.useState<string | null>(null);
  const swipeRef = React.useRef<{
    noteId: string;
    pointerId: number;
    startX: number;
    startY: number;
    offset: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = React.useRef<{ noteId: string; until: number } | null>(null);

  const beginNoteSwipe = (noteId: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swipeRef.current = {
      noteId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offset: 0,
      dragging: false,
    };
  };

  const moveNoteSwipe = (noteId: string, e: React.PointerEvent<HTMLDivElement>) => {
    const state = swipeRef.current;
    if (!state || state.noteId !== noteId || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (!state.dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        swipeRef.current = null;
        return;
      }
      if (dx > 0) {
        swipeRef.current = null;
        return;
      }
      state.dragging = true;
      setActiveSwipeNoteId(noteId);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    const offset = Math.max(-116, Math.min(0, dx));
    state.offset = offset;
    setSwipeOffsets((prev) => ({ ...prev, [noteId]: offset }));
  };

  const finishNoteSwipe = (noteId: string, e: React.PointerEvent<HTMLDivElement>) => {
    const state = swipeRef.current;
    if (!state || state.noteId !== noteId || state.pointerId !== e.pointerId) return;
    const shouldTrash = state.dragging && state.offset <= -72;
    if (state.dragging) {
      suppressClickRef.current = { noteId, until: Date.now() + 700 };
    }
    swipeRef.current = null;
    setActiveSwipeNoteId(null);
    setSwipeOffsets((prev) => ({ ...prev, [noteId]: shouldTrash ? -116 : 0 }));
    if (shouldTrash) onMoveToTrash(noteId);
  };

  const cancelNoteSwipe = (noteId: string) => {
    if (swipeRef.current?.noteId === noteId) swipeRef.current = null;
    setActiveSwipeNoteId(null);
    setSwipeOffsets((prev) => ({ ...prev, [noteId]: 0 }));
  };

  // Filter logic"""
if insert_marker not in s:
    raise SystemExit('NoteList function marker not found')
s = s.replace(insert_marker, swipe_helpers, 1)

# Add Trash button before reminder button.
marker = "            {/* Reminder Bell */}\n"
trash_button = """            <button
              id="trash-header-btn"
              type="button"
              onClick={onOpenTrashModal}
              className="justify-center items-center inline-flex min-h-11 min-w-11 relative p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
              title="ゴミ箱（1時間で自動削除）"
              aria-label={`ゴミ箱 ${trashCount}件`}
            >
              <Trash2 className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              {trashCount > 0 && (
                <span className="absolute top-1 right-0 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {trashCount}
                </span>
              )}
            </button>

"""
if marker not in s:
    raise SystemExit('NoteList reminder marker not found')
s = s.replace(marker, trash_button + marker, 1)

# Slightly larger, more readable home typography.
s = s.replace("text-black text-sm font-bold rounded-xl", "text-black text-base font-bold rounded-xl", 1)
s = s.replace("className=\"min-h-11 w-full pl-9 pr-8 py-2 text-xs sm:text-sm", "className=\"min-h-11 w-full pl-9 pr-8 py-2 text-sm sm:text-base", 1)
s = s.replace("overflow-x-auto py-2.5 no-scrollbar text-xs", "overflow-x-auto py-2.5 no-scrollbar text-sm", 1)
s = s.replace("pb-1 text-[11px] font-medium", "pb-1 text-sm font-medium", 1)
s = s.replace("text-xs font-semibold text-neutral-500", "text-sm font-semibold text-neutral-500")
s = s.replace("<p className=\"text-sm font-medium\">一致するメモがありません</p>", "<p className=\"text-base font-medium\">一致するメモがありません</p>", 1)
s = s.replace("<p className=\"text-xs mt-1\">検索条件を変更するか、新しいメモを作成してください。</p>", "<p className=\"text-sm mt-1\">検索条件を変更するか、新しいメモを作成してください。</p>", 1)

# Replace the card return block with swipe-aware markup.
func_start = s.index("  function renderNoteCard(note: Note) {")
return_start = s.index("    return (", func_start)
end_marker = "    );\n  }\n};"
return_end = s.index(end_marker, return_start)
new_return = """    const swipeOffset = swipeOffsets[note.id] || 0;
    const isActivelySwiping = activeSwipeNoteId === note.id;

    return (
      <div key={note.id} className="relative overflow-hidden" data-swipe-note-shell={note.id}>
        <div
          className="absolute inset-y-0 right-0 w-28 bg-rose-600 text-white flex flex-col items-center justify-center gap-1 select-none"
          aria-hidden="true"
        >
          <Trash2 className="w-5 h-5" />
          <span className="text-sm font-bold">ゴミ箱</span>
        </div>
        <div
          data-note-card="true"
          data-note-id={note.id}
          onPointerDown={(e) => beginNoteSwipe(note.id, e)}
          onPointerMove={(e) => moveNoteSwipe(note.id, e)}
          onPointerUp={(e) => finishNoteSwipe(note.id, e)}
          onPointerCancel={() => cancelNoteSwipe(note.id)}
          onClick={() => {
            const suppressed = suppressClickRef.current;
            if (suppressed?.noteId === note.id && suppressed.until > Date.now()) return;
            onSelectNote(note);
          }}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            touchAction: 'pan-y',
          }}
          className={`relative p-4 cursor-pointer bg-white dark:bg-[#1c1c1e] ${
            isActivelySwiping ? '' : 'transition-transform duration-200 ease-out'
          } transition-colors active:bg-neutral-100 dark:active:bg-neutral-800 ${
            isSelected
              ? 'bg-amber-500/10 dark:bg-amber-500/15'
              : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white truncate flex-1">
              {note.title || '無題のメモ'}
            </h2>
            <span className="text-xs text-neutral-400 shrink-0 font-normal">
              {formatNoteDate(note.updatedAt)}
            </span>
          </div>

          <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
            {cleanSnippet(note.content)}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-1">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-amber-600 dark:text-amber-400 font-medium"
              >
                #{tag}
              </span>
            ))}

            {totalTasks > 0 && (
              <span
                className={`text-xs inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${
                  completedTasks === totalTasks
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {completedTasks}/{totalTasks}
              </span>
            )}

            {note.attachments.length > 0 && (
              <span className="text-xs inline-flex items-center gap-0.5 text-neutral-500 dark:text-neutral-400">
                <Paperclip className="w-3.5 h-3.5" />
                {note.attachments.length}
              </span>
            )}

            {hasOverdue ? (
              <span className="text-xs inline-flex items-center gap-0.5 text-rose-500 font-medium bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                <AlertCircle className="w-3.5 h-3.5" />
                期限超過
              </span>
            ) : note.dueDate ? (
              <span className="text-xs inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                <Clock className="w-3.5 h-3.5" />
                {new Date(note.dueDate).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );"""
s = s[:return_start] + new_return + s[return_end + len("    );"):]
p.write_text(s)

# ---------- index.css ----------
p = Path('src/index.css')
s = p.read_text()
old = "  html, body {\n    font-family:"
new = "  html {\n    font-size: 17px;\n  }\n\n  html, body {\n    font-family:"
if old not in s:
    raise SystemExit('index base typography marker not found')
s = s.replace(old, new, 1)
s = s.replace('font-size: 16px;', 'font-size: 17px;')
s = s.replace('font-size: 16px !important;', 'font-size: 17px !important;')
p.write_text(s)
