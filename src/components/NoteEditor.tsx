import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Note, TaskItem, AttachmentItem, CloudflareSyncConfig } from '../types';
import {
  ChevronLeft,
  Pin,
  Trash2,
  Paperclip,
  CheckSquare,
  Eye,
  Edit3,
  Calendar,
  Clock,
  Plus,
  X,
  FileText,
  Tag as TagIcon,
  Bold,
  Italic,
  Heading,
  List,
  Code,
  Quote,
  CheckCircle2,
  Circle,
  Download,
  Save,
  MoreHorizontal,
  Maximize2
} from 'lucide-react';

interface NoteEditorProps {
  note: Note;
  allExistingTags: string[];
  onUpdateNote: (updated: Note) => void;
  onDeleteNote: (noteId: string) => void;
  onBack: () => void;
  onOpenAttachment: (attachment: AttachmentItem) => void;
  onManualSave: () => Promise<boolean>;
  syncStatus: CloudflareSyncConfig['status'];
  isOnline: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  allExistingTags,
  onUpdateNote,
  onDeleteNote,
  onBack,
  onOpenAttachment,
  onManualSave,
  syncStatus,
  isOnline,
}) => {
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [showReminderSetting, setShowReminderSetting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestNoteRef = useRef<Note>(note);
  latestNoteRef.current = note;

  // Update title
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaveState('idle');
    onUpdateNote({
      ...note,
      title: e.target.value,
      updatedAt: Date.now(),
    });
  };

  // Update content
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSaveState('idle');
    onUpdateNote({
      ...note,
      content: e.target.value,
      updatedAt: Date.now(),
    });
  };

  // Toggle Pin
  const handleTogglePin = () => {
    onUpdateNote({
      ...note,
      isPinned: !note.isPinned,
      updatedAt: Date.now(),
    });
  };

  // Add Tag
  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim().replace(/^#/, '');
    if (!trimmed || note.tags.includes(trimmed)) return;
    onUpdateNote({
      ...note,
      tags: [...note.tags, trimmed],
      updatedAt: Date.now(),
    });
    setNewTagInput('');
    setShowTagInput(false);
  };

  // Remove Tag
  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateNote({
      ...note,
      tags: note.tags.filter((t) => t !== tagToRemove),
      updatedAt: Date.now(),
    });
  };

  // Add Task
  const handleAddTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskText.trim()) return;

    const newTask: TaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      text: newTaskText.trim(),
      completed: false,
      dueDate: newTaskDueDate || undefined,
    };

    onUpdateNote({
      ...note,
      tasks: [...note.tasks, newTask],
      updatedAt: Date.now(),
    });

    setNewTaskText('');
    setNewTaskDueDate('');
  };

  // Toggle Task Completion
  const handleToggleTask = (taskId: string) => {
    onUpdateNote({
      ...note,
      tasks: note.tasks.map((t) =>
        t.id === taskId ? { ...t, completed: !t.completed } : t
      ),
      updatedAt: Date.now(),
    });
  };

  // Delete Task
  const handleDeleteTask = (taskId: string) => {
    onUpdateNote({
      ...note,
      tasks: note.tasks.filter((t) => t.id !== taskId),
      updatedAt: Date.now(),
    });
  };

  // Update Task Due Date
  const handleTaskDueDateChange = (taskId: string, dueDate: string) => {
    onUpdateNote({
      ...note,
      tasks: note.tasks.map((t) =>
        t.id === taskId ? { ...t, dueDate: dueDate || undefined } : t
      ),
      updatedAt: Date.now(),
    });
  };

  // Handle File Upload (Image or PDF). Read the whole selection first and then
  // update once, otherwise simultaneous FileReader callbacks overwrite each other.
  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024;
    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter((file) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isImg = file.type.startsWith('image/');
      return (isPdf || isImg) && file.size <= MAX_ATTACHMENT_SIZE;
    });

    const rejectedFiles = selectedFiles.filter((file) => !validFiles.includes(file));
    if (rejectedFiles.length > 0) {
      alert(
        `画像またはPDF（1ファイル15MB以下）のみ添付できます。
対象外: ${rejectedFiles
          .map((file) => file.name)
          .join(', ')}`
      );
    }
    if (validFiles.length === 0) return;

    try {
      const newAttachments = await Promise.all(
        validFiles.map(
          (file, index) =>
            new Promise<AttachmentItem>((resolve, reject) => {
              const isPdf =
                file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
              const reader = new FileReader();
              reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
              reader.onload = (event) => {
                const dataUrl = event.target?.result;
                if (typeof dataUrl !== 'string' || !dataUrl) {
                  reject(new Error(`Failed to read ${file.name}`));
                  return;
                }

                resolve({
                  id: `att-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
                  name: file.name,
                  type: isPdf ? 'pdf' : 'image',
                  mimeType: file.type || (isPdf ? 'application/pdf' : 'image/*'),
                  size: file.size,
                  dataUrl,
                  createdAt: Date.now(),
                });
              };
              reader.readAsDataURL(file);
            })
        )
      );

      const latestNote = latestNoteRef.current;
      onUpdateNote({
        ...latestNote,
        attachments: [...latestNote.attachments, ...newAttachments],
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.error('Attachment read failed', err);
      alert('添付ファイルの読み込みに失敗しました。ファイルを確認してもう一度お試しください。');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void processFiles(e.target.files);
    e.target.value = '';
  };

  // Delete Attachment
  const handleDeleteAttachment = (attId: string) => {
    if (!confirm('この添付ファイルを削除しますか？')) return;
    onUpdateNote({
      ...note,
      attachments: note.attachments.filter((a) => a.id !== attId),
      updatedAt: Date.now(),
    });
  };

  // Markdown Formatting Helper
  const insertMarkdown = (syntaxBefore: string, syntaxAfter: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const previousContent = note.content;
    const selectedText = previousContent.substring(start, end) || 'テキスト';

    const replacement = `${syntaxBefore}${selectedText}${syntaxAfter}`;
    const newContent =
      previousContent.substring(0, start) + replacement + previousContent.substring(end);

    onUpdateNote({
      ...note,
      content: newContent,
      updatedAt: Date.now(),
    });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + syntaxBefore.length,
        start + syntaxBefore.length + selectedText.length
      );
    }, 0);
  };

  // Drag & drop files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    void processFiles(e.dataTransfer.files);
  };

  const handleManualSaveClick = async () => {
    setSaveState('saving');
    const ok = await onManualSave();
    setSaveState(ok ? 'saved' : 'error');
    return ok;
  };

  const handleBackSafely = async () => {
    const ok = await handleManualSaveClick();
    if (ok) onBack();
  };

  const localSaveLabel =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'saved'
      ? '✓ 端末に保存済み'
      : saveState === 'error'
      ? '保存に失敗'
      : '自動保存オン';

  const cloudSyncLabel = !isOnline
    ? '☁ オフライン・端末保存'
    : syncStatus === 'syncing'
    ? '☁ 同期中…'
    : syncStatus === 'success'
    ? '☁ 同期済み'
    : syncStatus === 'error'
    ? '☁ 同期エラー'
    : '☁ 同期待ち';

  const completedTasksCount = note.tasks.filter((t) => t.completed).length;

  return (
    <div
      id="note-editor-container"
      className="flex-1 flex flex-col h-full bg-white dark:bg-[#1c1c1e] overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Mobile-first top navigation: primary actions only */}
      <div className="editor-mobile-header relative flex items-center justify-between px-3 pb-2 bg-neutral-50/95 dark:bg-[#1c1c1e]/95 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 z-30">
        <button
          id="editor-back-btn"
          type="button"
          onClick={() => void handleBackSafely()}
          className="min-h-11 px-1.5 -ml-1 flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold text-sm hover:opacity-80 active:opacity-60 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>メモ一覧</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            id="editor-save-btn"
            type="button"
            onClick={() => void handleManualSaveClick()}
            disabled={saveState === 'saving'}
            className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 active:bg-amber-500/20 disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{saveState === 'saving' ? '保存中' : '保存'}</span>
          </button>

          <div className="relative">
            <button
              id="editor-more-btn"
              type="button"
              aria-label="その他の操作"
              aria-expanded={showMoreMenu}
              onClick={() => setShowMoreMenu((v) => !v)}
              className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 active:opacity-70 transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {showMoreMenu && (
              <div
                id="editor-more-menu"
                className="absolute right-0 top-full mt-1 w-52 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white/98 dark:bg-neutral-900/98 shadow-2xl backdrop-blur-xl z-50"
              >
                <button
                  id="editor-attach-file-btn"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full min-h-11 px-4 flex items-center gap-3 text-sm text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Paperclip className="w-4 h-4 text-amber-500" />
                  画像・PDFを添付
                </button>
                <button
                  id="editor-reminder-btn"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowReminderSetting(true);
                  }}
                  className="w-full min-h-11 px-4 flex items-center gap-3 text-sm text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Clock className="w-4 h-4 text-amber-500" />
                  リマインダー
                </button>
                <button
                  id="editor-pin-btn"
                  type="button"
                  onClick={() => {
                    handleTogglePin();
                    setShowMoreMenu(false);
                  }}
                  className="w-full min-h-11 px-4 flex items-center gap-3 text-sm text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Pin className={`w-4 h-4 ${note.isPinned ? 'fill-current text-amber-500' : 'text-neutral-500'}`} />
                  {note.isPinned ? 'ピン留めを解除' : 'ピン留め'}
                </button>
                <button
                  id="editor-delete-btn"
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    if (confirm('このメモを削除しますか？')) onDeleteNote(note.id);
                  }}
                  className="w-full min-h-11 px-4 flex items-center gap-3 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                  メモを削除
                </button>
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      <div
        id="editor-save-status"
        className="safe-horizontal px-4 sm:px-6 py-1.5 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 bg-white/90 dark:bg-[#1c1c1e]/90 text-[11px] text-neutral-500 dark:text-neutral-400"
      >
        <span className={saveState === 'error' ? 'text-rose-500' : ''}>{localSaveLabel}</span>
        <span>•</span>
        <span className={syncStatus === 'error' ? 'text-rose-500' : ''}>{cloudSyncLabel}</span>
      </div>

      {/* Reminder Setting Drawer / Banner */}
      {showReminderSetting && (
        <div className="safe-horizontal px-4 py-3 bg-amber-50/70 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-amber-900 dark:text-amber-200">
              メモ全体の期日リマインダー:
            </span>
            <input
              type="datetime-local"
              value={note.dueDate || ''}
              onChange={(e) =>
                onUpdateNote({
                  ...note,
                  dueDate: e.target.value,
                  reminderActive: !!e.target.value,
                  updatedAt: Date.now(),
                })
              }
              className="bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 px-2 py-1 rounded text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            {note.dueDate && (
              <button
                type="button"
                onClick={() =>
                  onUpdateNote({
                    ...note,
                    dueDate: undefined,
                    reminderActive: false,
                    updatedAt: Date.now(),
                  })
                }
                className="min-h-11 px-2 inline-flex items-center text-neutral-500 hover:text-rose-500"
              >
                クリア
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowReminderSetting(false)}
              className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Scrollable Content */}
      <div className="editor-scroll-content safe-horizontal flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Title Input */}
        <div>
          <input
            id="note-title-input"
            type="text"
            placeholder="タイトルを入力..."
            value={note.title}
            onChange={handleTitleChange}
            className="w-full text-xl sm:text-2xl font-bold bg-transparent border-none outline-hidden text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
          />
          <div className="text-[11px] text-neutral-400 mt-1 flex items-center gap-2">
            <span>{new Date(note.updatedAt).toLocaleString('ja-JP')}</span>
            <span>•</span>
            <span>{note.content.length} 文字</span>
          </div>
        </div>

        {/* Tags Section */}
        <div className="flex flex-wrap items-center gap-1.5">
          <TagIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-amber-600 dark:text-amber-400 font-medium border border-neutral-200 dark:border-neutral-700"
            >
              #{tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {showTagInput ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="タグ名..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag(newTagInput);
                  }
                }}
                className="min-h-11 text-base sm:text-xs px-2 py-1 rounded-xl bg-white dark:bg-neutral-800 border border-amber-500 outline-none w-28"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleAddTag(newTagInput)}
                className="min-h-11 px-3 py-1 rounded-xl bg-amber-500 text-black text-sm font-semibold"
              >
                追加
              </button>
              <button
                type="button"
                onClick={() => setShowTagInput(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="add-tag-chip-btn"
              type="button"
              onClick={() => setShowTagInput(true)}
              className="inline-flex min-h-11 items-center gap-1 text-sm sm:text-xs px-3 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 hover:bg-neutral-200 text-neutral-500 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>タグを追加</span>
            </button>
          )}

          {/* Quick suggestions from other tags */}
          {showTagInput && allExistingTags.filter((t) => !note.tags.includes(t)).length > 0 && (
            <div className="w-full flex items-center gap-1 text-[11px] text-neutral-400 pt-1">
              <span>既存タグ:</span>
              {allExistingTags
                .filter((t) => !note.tags.includes(t))
                .slice(0, 5)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddTag(t)}
                    className="text-amber-500 hover:underline"
                  >
                    #{t}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Section Divider */}
        <hr className="border-neutral-100 dark:border-neutral-800" />

        {/* Checklist / Tasks (箇条書きタスク機能) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                すること・ToDoリスト
              </h3>
              {note.tasks.length > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-medium">
                  {completedTasksCount} / {note.tasks.length} 完了
                </span>
              )}
            </div>
          </div>

          {/* Task Items */}
          <div className="space-y-1.5">
            {note.tasks.map((task) => {
              const isOverdue =
                !task.completed &&
                task.dueDate &&
                new Date(task.dueDate).getTime() < Date.now();

              return (
                <div
                  key={task.id}
                  className={`group flex items-center justify-between gap-2 p-2 rounded-xl transition-colors ${
                    task.completed
                      ? 'bg-neutral-50/60 dark:bg-neutral-900/30'
                      : isOverdue
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50'
                      : 'bg-neutral-50 dark:bg-neutral-800/40 hover:bg-neutral-100 dark:hover:bg-neutral-800/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <button
                      type="button"
                      data-testid="task-toggle-complete-btn"
                      aria-label={`${task.text} を${task.completed ? '未完了' : '完了'}にする`}
                      onClick={() => handleToggleTask(task.id)}
                      className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-amber-500 transition-colors shrink-0"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>

                    <span
                      className={`text-xs flex-1 break-words ${
                        task.completed
                          ? 'line-through text-neutral-400 dark:text-neutral-500'
                          : 'text-neutral-800 dark:text-neutral-200 font-medium'
                      }`}
                    >
                      {task.text}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Due Date Picker or Label */}
                    <div className="relative flex items-center">
                      <input
                        type="datetime-local"
                        value={task.dueDate || ''}
                        onChange={(e) => handleTaskDueDateChange(task.id, e.target.value)}
                        className="min-h-11 text-[11px] bg-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 outline-none w-28 cursor-pointer"
                        title="タスクの期日を設定"
                      />
                    </div>

                    <div className="relative">
                      <button
                        id={`task-more-btn-${task.id}`}
                        data-testid="task-more-btn"
                        type="button"
                        aria-label={`${task.text} のその他の操作`}
                        aria-expanded={openTaskMenuId === task.id}
                        onClick={() => setOpenTaskMenuId((current) => current === task.id ? null : task.id)}
                        className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/70 dark:hover:bg-neutral-700/70 transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {openTaskMenuId === task.id && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-44 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl">
                          <button
                            id={`task-delete-btn-${task.id}`}
                            type="button"
                            onClick={() => {
                              if (confirm(`「${task.text}」を削除しますか？`)) {
                                handleDeleteTask(task.id);
                              }
                              setOpenTaskMenuId(null);
                            }}
                            className="w-full min-h-11 px-4 flex items-center gap-2 text-left text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                            タスクを削除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add New Task Form: stacked on phones so controls never get squeezed off-screen */}
          <form onSubmit={handleAddTask} className="flex flex-col lg:flex-row lg:items-center gap-2 pt-1">
            <input
              id="new-task-text-input"
              type="text"
              placeholder="新しいタスクを追加..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              className="w-full lg:flex-1 min-h-11 text-base lg:text-xs px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <input
                type="datetime-local"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="flex-1 lg:flex-none lg:w-44 min-h-11 text-base lg:text-xs px-2 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 focus:outline-none text-neutral-500"
                title="期限日時（任意）"
              />
              <button
                id="add-task-btn"
                type="submit"
                disabled={!newTaskText.trim()}
                className="min-w-20 min-h-11 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-300 disabled:opacity-40 text-black text-sm lg:text-xs font-semibold rounded-xl transition-colors"
              >
                追加
              </button>
            </div>
          </form>
        </div>

        {/* Section Divider */}
        <hr className="border-neutral-100 dark:border-neutral-800" />

        {/* Markdown Content Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center p-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
              <button
                id="mode-edit-btn"
                type="button"
                onClick={() => setViewMode('edit')}
                className={`min-h-11 px-3 rounded-lg text-sm sm:text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                編集
              </button>
              <button
                id="mode-preview-btn"
                type="button"
                onClick={() => setViewMode('preview')}
                className={`min-h-11 px-3 rounded-lg text-sm sm:text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <Eye className="w-4 h-4" />
                閲覧
              </button>
            </div>
          </div>

          {/* Formatting Toolbar (Only in edit mode) */}
          {viewMode === 'edit' && (
            <div className="markdown-toolbar flex flex-wrap items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60">
              <button
                type="button"
                onClick={() => insertMarkdown('**', '**')}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                title="太字 (**テキスト**)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('*', '*')}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                title="斜体 (*テキスト*)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('### ')}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                title="見出し (### 見出し)"
              >
                <Heading className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('- ')}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                title="リスト項目 (- 項目)"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('> ')}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                title="引用 (> 引用)"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('`', '`')}
                className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                title="インラインコード (`code`)"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Edit or Preview Mode Content */}
          {viewMode === 'edit' ? (
            <textarea
              id="note-content-textarea"
              ref={textareaRef}
              rows={12}
              placeholder="メモの内容をマークダウンで自由に入力... (画像やPDFのドラッグ＆ドロップも可能)"
              value={note.content}
              onChange={handleContentChange}
              className="w-full text-sm leading-relaxed bg-transparent border-none outline-hidden resize-y text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 font-sans min-h-[220px] select-text"
            />
          ) : (
            <div
              id="note-markdown-rendered-view"
              className="prose prose-sm dark:prose-invert max-w-none py-2 min-h-[200px] text-neutral-800 dark:text-neutral-200 select-text"
            >
              {note.content ? (
                <ReactMarkdown>{note.content}</ReactMarkdown>
              ) : (
                <p className="text-neutral-400 italic">内容がありません。「編集」タブから入力してください。</p>
              )}
            </div>
          )}
        </div>

        {/* Section Divider */}
        <hr className="border-neutral-100 dark:border-neutral-800" />

        {/* Attachments Section (画像・PDF添付) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                添付ファイル (画像・PDF)
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                {note.attachments.length} 件
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-11 items-center gap-1 px-2 -my-2 text-sm sm:text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              ファイルを追加
            </button>
          </div>

          {/* Drag and Drop Zone / Files List */}
          {note.attachments.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-colors ${
                isDraggingOver
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/40'
              }`}
            >
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-neutral-400" />
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                ここに画像やPDFファイルをドラッグ＆ドロップ
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">またはクリックしてファイルを選択</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {note.attachments.map((att) => (
                <div
                  key={att.id}
                  className="group relative flex items-center gap-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-amber-500/50 transition-colors"
                >
                  {/* Thumbnail / Icon */}
                  {att.type === 'image' ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      onClick={() => onOpenAttachment(att)}
                      className="w-12 h-12 rounded-lg object-cover cursor-pointer hover:opacity-80 shrink-0 border border-neutral-200 dark:border-neutral-700"
                    />
                  ) : (
                    <div
                      onClick={() => onOpenAttachment(att)}
                      className="w-12 h-12 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 cursor-pointer hover:bg-rose-500/20"
                    >
                      <FileText className="w-6 h-6" />
                    </div>
                  )}

                  {/* Info */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onOpenAttachment(att)}
                  >
                    <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {att.name}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {att.type === 'pdf' ? 'PDF ドキュメント' : '画像ファイル'} •{' '}
                      {(att.size / 1024).toFixed(0)} KB
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenAttachment(att)}
                      className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-amber-500 rounded-lg transition-colors"
                      title="拡大表示 / 開く"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-rose-500 rounded-lg transition-colors"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
