import React, { useEffect, useMemo, useState } from 'react';
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
