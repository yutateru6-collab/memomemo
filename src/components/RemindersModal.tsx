import React, { useState } from 'react';
import { Note, TaskItem } from '../types';
import { requestNotificationPermission } from '../services/notifications';
import { X, Bell, Calendar, CheckCircle2, Circle, AlertCircle, ExternalLink, Clock } from 'lucide-react';

interface RemindersModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onToggleTask: (noteId: string, taskId: string) => void;
  onSelectNote: (note: Note) => void;
  onUpdateTaskDueDate: (noteId: string, taskId: string, dueDate: string) => void;
}

export const RemindersModal: React.FC<RemindersModalProps> = ({
  isOpen,
  onClose,
  notes,
  onToggleTask,
  onSelectNote,
  onUpdateTaskDueDate,
}) => {
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [editingDueDateTaskId, setEditingDueDateTaskId] = useState<string | null>(null);
  const [tempDueDate, setTempDueDate] = useState<string>('');

  if (!isOpen) return null;

  // Extract all pending tasks with note context
  interface PendingTaskWithNote {
    task: TaskItem;
    note: Note;
    isOverdue: boolean;
    isDueSoon: boolean;
  }

  const now = Date.now();
  const pendingTasks: PendingTaskWithNote[] = [];

  notes.forEach((note) => {
    note.tasks.forEach((task) => {
      if (!task.completed) {
        let isOverdue = false;
        let isDueSoon = false;
        if (task.dueDate) {
          const dueMs = new Date(task.dueDate).getTime();
          isOverdue = dueMs < now;
          isDueSoon = !isOverdue && dueMs <= now + 24 * 60 * 60 * 1000;
        }
        pendingTasks.push({
          task,
          note,
          isOverdue,
          isDueSoon,
        });
      }
    });
  });

  // Sort by overdue first, then by earliest due date, then without date
  pendingTasks.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    if (a.task.dueDate && b.task.dueDate) {
      return new Date(a.task.dueDate).getTime() - new Date(b.task.dueDate).getTime();
    }
    if (a.task.dueDate && !b.task.dueDate) return -1;
    if (!a.task.dueDate && b.task.dueDate) return 1;
    return 0;
  });

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      new Notification('🔔 通知が有効になりました', {
        body: '期日を迎えたメモやToDoタスクを自動でお知らせします。',
      });
    }
  };

  const handleSaveDueDate = (noteId: string, taskId: string) => {
    onUpdateTaskDueDate(noteId, taskId, tempDueDate);
    setEditingDueDateTaskId(null);
  };

  return (
    <div
      id="reminders-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="reminders-modal-content"
        className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">未完了リマインダー</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                期日設定のあるタスクややり残したことの一覧
              </p>
            </div>
          </div>
          <button
            id="close-reminders-modal-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification Permission Card */}
        <div className="p-4 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <span className="font-medium">プッシュ通知ステータス: </span>
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
              className="px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold shrink-0 transition-colors shadow-xs"
            >
              通知を有効にする
            </button>
          )}
        </div>

        {/* Tasks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {pendingTasks.length === 0 ? (
            <div className="text-center py-12 text-neutral-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500/80" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                すべてのタスクが完了しています！
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                メモにチェックリストを追加すると、ここにリマインドされます。
              </p>
            </div>
          ) : (
            pendingTasks.map(({ task, note, isOverdue, isDueSoon }) => (
              <div
                key={`${note.id}-${task.id}`}
                className={`p-3 rounded-xl border transition-all ${
                  isOverdue
                    ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                    : isDueSoon
                    ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                    : 'bg-white dark:bg-[#252528] border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => onToggleTask(note.id, task.id)}
                    className="mt-0.5 text-neutral-400 hover:text-amber-500 shrink-0 transition-colors"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100 break-words">
                      {task.text}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                      {/* Note reference link */}
                      <button
                        type="button"
                        onClick={() => {
                          onSelectNote(note);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 text-neutral-500 hover:text-amber-500 transition-colors"
                      >
                        <span>📝 {note.title || '無題のメモ'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>

                      {/* Due Date Indicator */}
                      {task.dueDate ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                            isOverdue
                              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                              : isDueSoon
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                              : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          {isOverdue && <AlertCircle className="w-3 h-3" />}
                          {new Date(task.dueDate).toLocaleString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {isOverdue ? ' (期限切れ)' : isDueSoon ? ' (本日中)' : ''}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDueDateTaskId(task.id);
                            setTempDueDate(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
                          }}
                          className="text-neutral-400 hover:text-amber-500 underline decoration-dotted"
                        >
                          + 期限を設定
                        </button>
                      )}
                    </div>

                    {/* Due Date quick editor */}
                    {editingDueDateTaskId === task.id && (
                      <div className="mt-2 flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg">
                        <input
                          type="datetime-local"
                          value={tempDueDate}
                          onChange={(e) => setTempDueDate(e.target.value)}
                          className="text-xs bg-white dark:bg-neutral-900 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveDueDate(note.id, task.id)}
                          className="text-xs px-2.5 py-1 bg-amber-500 text-black font-semibold rounded"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDueDateTaskId(null)}
                          className="text-xs px-2 py-1 text-neutral-400 hover:text-neutral-200"
                        >
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 text-center text-xs text-neutral-500">
          未完了タスク {pendingTasks.length} 件 (定期的にバックグラウンドで期限を監視しています)
        </div>
      </div>
    </div>
  );
};
