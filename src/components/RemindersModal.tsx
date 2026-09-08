import React, { useState } from 'react';
import { Note, TaskItem } from '../types';
import { requestNotificationPermission } from '../services/notifications';
import { X, Bell, CheckCircle2, Circle, ExternalLink, Clock } from 'lucide-react';

interface RemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onToggleTask: (noteId: string, taskId: string) => void;
  onSelectNote: (note: Note) => void;
}

interface PendingTaskWithNote {
  task: TaskItem;
  note: Note;
}

export const RemindersModal: React.FC<RemindersModalProps> = ({
  isOpen,
  onClose,
  notes,
  onToggleTask,
  onSelectNote,
}) => {
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  if (!isOpen) return null;

  const pendingTasks: PendingTaskWithNote[] = [];
  notes.forEach((note) => {
    note.tasks.forEach((task) => {
      if (!task.completed) pendingTasks.push({ task, note });
    });
  });

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      new Notification('🔔 通知が有効になりました', {
        body: 'アプリを開いている間、メモ全体に設定した期限をお知らせします。',
      });
    }
  };

  return (
    <div
      id="reminders-modal-backdrop"
      className="modal-safe-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="reminders-modal-content"
        className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">未完了タスク</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">やり残したタスクの一覧</p>
            </div>
          </div>
          <button
            id="close-reminders-modal-btn"
            type="button"
            onClick={onClose}
            className="justify-center items-center inline-flex min-h-11 min-w-11 p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="font-medium">メモ期限の通知: </span>
              {notifPermission === 'granted' ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">許可済み</span>
              ) : notifPermission === 'denied' ? (
                <span className="text-rose-500 font-semibold">拒否されています</span>
              ) : (
                <span className="text-neutral-500">未設定</span>
              )}
            </div>
          </div>

          {notifPermission !== 'granted' && (
            <button
              type="button"
              onClick={handleRequestPermission}
              id="enable-notifications-btn"
              className="min-h-11 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold shrink-0 transition-colors shadow-xs"
            >
              通知を有効にする
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {pendingTasks.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500/80" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">すべてのタスクが完了しています！</p>
              <p className="text-xs text-neutral-400 mt-1">メモにチェックリストを追加すると、ここに表示されます。</p>
            </div>
          ) : (
            pendingTasks.map(({ task, note }) => (
              <div
                key={`${note.id}-${task.id}`}
                className="p-3 rounded-xl border bg-white dark:bg-[#252528] border-neutral-200 dark:border-neutral-800"
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    data-testid="reminder-task-toggle-btn"
                    onClick={() => onToggleTask(note.id, task.id)}
                    className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-amber-500 shrink-0 transition-colors"
                  >
                    <Circle className="w-4 h-4" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100 break-words">{task.text}</p>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNote(note);
                        onClose();
                      }}
                      className="mt-1.5 min-h-11 inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-amber-500 transition-colors"
                    >
                      <span>📝 {note.title || '無題のメモ'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
          未完了タスク {pendingTasks.length} 件
        </div>
      </div>
    </div>
  );
};
