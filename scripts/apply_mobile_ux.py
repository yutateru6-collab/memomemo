from pathlib import Path
import re

# ---------------- NoteEditor.tsx ----------------
path = Path('src/components/NoteEditor.tsx')
s = path.read_text()

s = s.replace(
    "import { Note, TaskItem, AttachmentItem } from '../types';",
    "import { Note, TaskItem, AttachmentItem, CloudflareSyncConfig } from '../types';"
)
s = s.replace(
    "  Download,\n  Maximize2\n",
    "  Download,\n  Save,\n  MoreHorizontal,\n  Maximize2\n"
)

s = s.replace(
    "  onOpenAttachment: (attachment: AttachmentItem) => void;\n}",
    "  onOpenAttachment: (attachment: AttachmentItem) => void;\n  onManualSave: () => Promise<boolean>;\n  syncStatus: CloudflareSyncConfig['status'];\n  isOnline: boolean;\n}"
)
s = s.replace(
    "  onBack,\n  onOpenAttachment,\n}) => {",
    "  onBack,\n  onOpenAttachment,\n  onManualSave,\n  syncStatus,\n  isOnline,\n}) => {"
)
s = s.replace(
    "  const [isDraggingOver, setIsDraggingOver] = useState(false);\n",
    "  const [isDraggingOver, setIsDraggingOver] = useState(false);\n  const [showMoreMenu, setShowMoreMenu] = useState(false);\n  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');\n"
)
s = s.replace(
    "  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {\n    onUpdateNote({",
    "  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {\n    setSaveState('idle');\n    onUpdateNote({"
)
s = s.replace(
    "  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {\n    onUpdateNote({",
    "  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {\n    setSaveState('idle');\n    onUpdateNote({"
)

marker = "  const completedTasksCount = note.tasks.filter((t) => t.completed).length;"
assert marker in s
helpers = """  const handleManualSaveClick = async () => {
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

"""
s = s.replace(marker, helpers + marker)

header_pattern = re.compile(
    r"      \{/\* iOS Top Navigation Bar \*/\}.*?      \{/\* Reminder Setting Drawer / Banner \*/\}",
    re.S,
)
new_header = """      {/* Mobile-first top navigation: primary actions only */}
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
        className="px-4 sm:px-6 py-1.5 flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 bg-white/90 dark:bg-[#1c1c1e]/90 text-[11px] text-neutral-500 dark:text-neutral-400"
      >
        <span className={saveState === 'error' ? 'text-rose-500' : ''}>{localSaveLabel}</span>
        <span>•</span>
        <span className={syncStatus === 'error' ? 'text-rose-500' : ''}>{cloudSyncLabel}</span>
      </div>

      {/* Reminder Setting Drawer / Banner */}"""
s, count = header_pattern.subn(new_header, s, count=1)
assert count == 1, f'header replacement count={count}'

s = s.replace(
    '      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">',
    '      <div className="editor-scroll-content flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">',
    1,
)

s = s.replace(
    'className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-rose-500 transition-opacity"',
    'className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 min-w-11 min-h-11 inline-flex items-center justify-center text-neutral-400 hover:text-rose-500 transition-opacity"',
)

task_pattern = re.compile(
    r"          \{/\* Add New Task Form \*/\}\n          <form onSubmit=\{handleAddTask\}.*?          </form>",
    re.S,
)
new_task_form = """          {/* Add New Task Form: stacked on phones so controls never get squeezed off-screen */}
          <form onSubmit={handleAddTask} className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <input
              id="new-task-text-input"
              type="text"
              placeholder="新しいタスクを追加..."
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              className="w-full sm:flex-1 min-h-11 text-base sm:text-xs px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="datetime-local"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="flex-1 sm:flex-none sm:w-44 min-h-11 text-base sm:text-xs px-2 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 focus:outline-none text-neutral-500"
                title="期限日時（任意）"
              />
              <button
                id="add-task-btn"
                type="submit"
                disabled={!newTaskText.trim()}
                className="min-w-20 min-h-11 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-300 disabled:opacity-40 text-black text-sm sm:text-xs font-semibold rounded-xl transition-colors"
              >
                追加
              </button>
            </div>
          </form>"""
s, count = task_pattern.subn(new_task_form, s, count=1)
assert count == 1, f'task form replacement count={count}'

markdown_marker = "          {/* Formatting Toolbar (Only in edit mode) */}"
assert markdown_marker in s
mode_switch = """          <div className="flex items-center justify-between gap-2">
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

"""
s = s.replace(markdown_marker, mode_switch + markdown_marker, 1)

s = s.replace(
    'className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60"',
    'className="markdown-toolbar flex flex-wrap items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/60"',
    1,
)
s = s.replace(
    'className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"',
    'className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 sm:p-1.5 inline-flex items-center justify-center rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"',
)
s = s.replace(
    'className="w-full text-sm leading-relaxed bg-transparent border-none outline-hidden resize-y text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 font-sans min-h-[220px]"',
    'className="w-full text-sm leading-relaxed bg-transparent border-none outline-hidden resize-y text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 font-sans min-h-[220px] select-text"',
    1,
)
s = s.replace(
    'className="prose prose-sm dark:prose-invert max-w-none py-2 min-h-[200px] text-neutral-800 dark:text-neutral-200"',
    'className="prose prose-sm dark:prose-invert max-w-none py-2 min-h-[200px] text-neutral-800 dark:text-neutral-200 select-text"',
    1,
)
s = s.replace(
    'className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800/60 hover:bg-neutral-200 text-neutral-500 transition-colors"',
    'className="inline-flex min-h-11 items-center gap-1 text-sm sm:text-xs px-3 py-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 hover:bg-neutral-200 text-neutral-500 transition-colors"',
    1,
)
s = s.replace(
    'className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"',
    'className="inline-flex min-h-11 items-center gap-1 px-2 -my-2 text-sm sm:text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"',
    1,
)
path.write_text(s)

# ---------------- App.tsx ----------------
path = Path('src/App.tsx')
s = path.read_text()
create_marker = "  // Create New Note\n"
assert create_marker in s
manual_save = """  // Explicit mobile Save / Back flush. Local persistence is authoritative.
  // Cloud sync is kicked immediately when configured, but navigation is never blocked by the network.
  const handleManualSave = useCallback(async (noteId: string): Promise<boolean> => {
    const currentNote = notesRef.current.find((note) => note.id === noteId);
    if (!currentNote) return false;

    try {
      await saveNote(currentNote);
    } catch (err) {
      reportStorageError('手動保存', err);
      return false;
    }

    if (autoSyncTimer.current) {
      window.clearTimeout(autoSyncTimer.current);
      autoSyncTimer.current = null;
    }

    const currentConfig = cfConfigRef.current;
    if (
      navigator.onLine &&
      currentConfig.autoSync &&
      currentConfig.syncCode &&
      currentConfig.workerUrl.trim()
    ) {
      void triggerCloudflareSync();
    }

    return true;
  }, [reportStorageError, triggerCloudflareSync]);

"""
s = s.replace(create_marker, manual_save + create_marker, 1)

anchor = "onOpenAttachment={(att) => setActiveAttachment(att)}"
count = s.count(anchor)
assert count == 2, f'NoteEditor prop anchor count={count}'
s = s.replace(
    anchor,
    anchor + "\n                  onManualSave={() => handleManualSave(selectedNote.id)}\n                  syncStatus={cfConfig.status}\n                  isOnline={isOnline}",
)
path.write_text(s)

# ---------------- index.css ----------------
path = Path('src/index.css')
s = path.read_text()
css = r'''

/* Mobile editor ergonomics: safe area + keyboard-friendly spacing. */
.editor-mobile-header {
  padding-top: max(env(safe-area-inset-top), 16px);
}

@media (min-width: 640px) {
  .editor-mobile-header {
    padding-top: 10px;
  }
}

@media (max-width: 639px) {
  /* iPhone Safari zooms focused form controls below 16px. */
  input:not(#note-title-input),
  textarea,
  select {
    font-size: 16px !important;
  }

  #note-content-textarea {
    font-size: 16px !important;
  }

  .editor-scroll-content {
    padding-bottom: max(112px, calc(env(safe-area-inset-bottom) + 88px));
  }
}
'''
if 'Mobile editor ergonomics' not in s:
    s += css
path.write_text(s)

# ---------------- index.html ----------------
path = Path('index.html')
s = path.read_text().replace(
    '<body class="overscroll-none select-none bg-neutral-100 text-neutral-900 dark:bg-[#000000] dark:text-neutral-100">',
    '<body class="overscroll-none bg-neutral-100 text-neutral-900 dark:bg-[#000000] dark:text-neutral-100">',
)
path.write_text(s)

# Sanity checks before committing.
ne = Path('src/components/NoteEditor.tsx').read_text()
app = Path('src/App.tsx').read_text()
assert 'id="editor-save-btn"' in ne
assert 'id="editor-save-status"' in ne
assert 'id="editor-more-btn"' in ne
assert 'onManualSave' in ne
assert 'handleManualSave' in app
assert 'opacity-0 group-hover:opacity-100' not in ne
assert 'editor-scroll-content' in ne
print('Mobile UX remediation applied successfully')
