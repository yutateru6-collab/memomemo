import React from 'react';
import { Note, FilterState, CloudflareSyncConfig, ThemeMode } from '../types';
import {
  Search,
  X,
  Pin,
  SquarePen,
  Cloud,
  Bell,
  Sun,
  Moon,
  CheckCircle2,
  Paperclip,
  Calendar,
  AlertCircle,
  Clock
} from 'lucide-react';

interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (note: Note) => void;
  onCreateNewNote: () => void;
  filters: FilterState;
  onUpdateFilters: (filters: FilterState) => void;
  allTags: string[];
  cfConfig: CloudflareSyncConfig;
  onOpenCloudflareModal: () => void;
  onOpenRemindersModal: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  isOnline: boolean;
  totalPendingTasksCount: number;
}

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNewNote,
  filters,
  onUpdateFilters,
  allTags,
  cfConfig,
  onOpenCloudflareModal,
  onOpenRemindersModal,
  themeMode,
  onToggleTheme,
  isOnline,
  totalPendingTasksCount,
}) => {
  // Filter logic
  const filteredNotes = notes.filter((note) => {
    // 1. Search Query
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const matchTitle = note.title.toLowerCase().includes(q);
      const matchContent = note.content.toLowerCase().includes(q);
      const matchTag = note.tags.some((t) => t.toLowerCase().includes(q));
      const matchTasks = note.tasks.some((t) => t.text.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchTag && !matchTasks) {
        return false;
      }
    }

    // 2. Selected Tag
    if (filters.selectedTag && !note.tags.includes(filters.selectedTag)) {
      return false;
    }

    // 3. Only Pending Tasks
    if (filters.showOnlyPendingTasks) {
      const hasUnfinished = note.tasks.some((t) => !t.completed);
      if (!hasUnfinished) return false;
    }

    // 4. Only With Attachments
    if (filters.showOnlyWithAttachments && note.attachments.length === 0) {
      return false;
    }

    return true;
  });

  const pinnedNotes = filteredNotes.filter((n) => n.isPinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.isPinned);

  const formatNoteDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  };

  const cleanSnippet = (content: string) => {
    return content
      .replace(/^#+\s+/gm, '')
      .replace(/[*_`~[\]]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim()
      .split('\n')
      .find((line) => line.trim().length > 0) || '追加のテキストなし';
  };

  return (
    <div
      id="note-list-container"
      className="flex-1 flex flex-col h-full bg-[#f2f2f7] dark:bg-[#000000] overflow-hidden select-none"
    >
      {/* iOS Top Navigation Header */}
      <div className="pt-3 px-4 pb-2 bg-[#f2f2f7]/80 dark:bg-[#000000]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
              メモ
            </h1>
            {!isOnline && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-medium">
                オフライン
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Reminder Bell */}
            <button
              id="reminders-header-btn"
              type="button"
              onClick={onOpenRemindersModal}
              className="relative p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
              title="未完了リマインダー一覧"
            >
              <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              {totalPendingTasksCount > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {totalPendingTasksCount}
                </span>
              )}
            </button>

            {/* Cloudflare Sync Button */}
            <button
              id="cloudflare-header-btn"
              type="button"
              onClick={onOpenCloudflareModal}
              className="relative p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
              title="Cloudflare 同期設定"
            >
              <Cloud className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              <span
                className={`absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-[#f2f2f7] dark:border-[#000000] ${
                  !isOnline
                    ? 'bg-neutral-400'
                    : cfConfig.status === 'success'
                    ? 'bg-emerald-500'
                    : cfConfig.status === 'syncing'
                    ? 'bg-amber-400 animate-pulse'
                    : cfConfig.status === 'error'
                    ? 'bg-rose-500'
                    : 'bg-neutral-400'
                }`}
              />
            </button>

            {/* Dark Mode Toggle */}
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
              title={`外観切り替え (${themeMode === 'dark' ? 'ダーク' : 'ライト'})`}
            >
              {themeMode === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-neutral-700" />
              )}
            </button>
          </div>
        </div>

        {/* iOS Style Search Bar */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 pointer-events-none" />
          <input
            id="notes-search-input"
            type="text"
            placeholder="検索 (タイトル、内容、タグ、タスク)"
            value={filters.searchQuery}
            onChange={(e) => onUpdateFilters({ ...filters, searchQuery: e.target.value })}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-neutral-200/80 dark:bg-neutral-800/90 text-neutral-900 dark:text-white placeholder:text-neutral-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
          />
          {filters.searchQuery && (
            <button
              id="search-clear-btn"
              type="button"
              onClick={() => onUpdateFilters({ ...filters, searchQuery: '' })}
              className="absolute right-2.5 p-0.5 rounded-full bg-neutral-400 dark:bg-neutral-600 text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Tag & Filters Horizontal Scroller */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2.5 no-scrollbar text-xs">
          <button
            id="filter-tag-all"
            type="button"
            onClick={() => onUpdateFilters({ ...filters, selectedTag: null })}
            className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
              filters.selectedTag === null && !filters.showOnlyPendingTasks && !filters.showOnlyWithAttachments
                ? 'bg-amber-500 text-black shadow-xs font-semibold'
                : 'bg-white dark:bg-[#1c1c1e] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            すべて ({notes.length})
          </button>

          {/* Pending Tasks Filter */}
          <button
            id="filter-pending-tasks"
            type="button"
            onClick={() =>
              onUpdateFilters({
                ...filters,
                showOnlyPendingTasks: !filters.showOnlyPendingTasks,
              })
            }
            className={`px-3 py-1 rounded-full whitespace-nowrap font-medium flex items-center gap-1 transition-colors ${
              filters.showOnlyPendingTasks
                ? 'bg-amber-500 text-black shadow-xs font-semibold'
                : 'bg-white dark:bg-[#1c1c1e] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>未完了あり</span>
          </button>

          {/* Attachments Filter */}
          <button
            id="filter-has-attachments"
            type="button"
            onClick={() =>
              onUpdateFilters({
                ...filters,
                showOnlyWithAttachments: !filters.showOnlyWithAttachments,
              })
            }
            className={`px-3 py-1 rounded-full whitespace-nowrap font-medium flex items-center gap-1 transition-colors ${
              filters.showOnlyWithAttachments
                ? 'bg-amber-500 text-black shadow-xs font-semibold'
                : 'bg-white dark:bg-[#1c1c1e] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>添付あり</span>
          </button>

          {/* Tags List */}
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                onUpdateFilters({
                  ...filters,
                  selectedTag: filters.selectedTag === tag ? null : tag,
                })
              }
              className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                filters.selectedTag === tag
                  ? 'bg-amber-500 text-black shadow-xs font-semibold'
                  : 'bg-white dark:bg-[#1c1c1e] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Note List Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        {filteredNotes.length === 0 ? (
          <div className="text-center py-16 text-neutral-400">
            <p className="text-sm font-medium">一致するメモがありません</p>
            <p className="text-xs mt-1">検索条件を変更するか、新しいメモを作成してください。</p>
            <button
              type="button"
              onClick={onCreateNewNote}
              className="mt-4 px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-semibold shadow-xs hover:bg-amber-400 transition-colors"
            >
              + 新しいメモを作成
            </button>
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 px-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span>ピン留め</span>
                </div>
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl overflow-hidden shadow-xs border border-neutral-200/60 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {pinnedNotes.map((note) => renderNoteCard(note))}
                </div>
              </div>
            )}

            {/* Unpinned Section */}
            {unpinnedNotes.length > 0 && (
              <div className="space-y-1.5">
                {pinnedNotes.length > 0 && (
                  <div className="px-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                    メモ
                  </div>
                )}
                <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl overflow-hidden shadow-xs border border-neutral-200/60 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {unpinnedNotes.map((note) => renderNoteCard(note))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom iOS Toolbar */}
      <div className="py-2.5 px-4 bg-[#f2f2f7]/90 dark:bg-[#1c1c1e]/90 backdrop-blur-md border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between z-20 pb-safe">
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
          {notes.length} 件のメモ
        </div>

        <button
          id="create-new-note-bottom-btn"
          type="button"
          onClick={onCreateNewNote}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-full shadow-sm transition-all transform active:scale-95"
        >
          <SquarePen className="w-4 h-4" />
          <span>新規メモ</span>
        </button>
      </div>
    </div>
  );

  function renderNoteCard(note: Note) {
    const isSelected = selectedNoteId === note.id;
    const completedTasks = note.tasks.filter((t) => t.completed).length;
    const totalTasks = note.tasks.length;
    const hasPendingTasks = totalTasks > completedTasks;

    const hasOverdue =
      note.tasks.some(
        (t) => !t.completed && t.dueDate && new Date(t.dueDate).getTime() < Date.now()
      ) ||
      (note.dueDate && new Date(note.dueDate).getTime() < Date.now());

    return (
      <div
        key={note.id}
        onClick={() => onSelectNote(note)}
        className={`p-3.5 cursor-pointer transition-colors active:bg-neutral-100 dark:active:bg-neutral-800 ${
          isSelected
            ? 'bg-amber-500/10 dark:bg-amber-500/15'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white truncate flex-1">
            {note.title || '無題のメモ'}
          </h2>
          <span className="text-[11px] text-neutral-400 shrink-0 font-normal">
            {formatNoteDate(note.updatedAt)}
          </span>
        </div>

        {/* Snippet */}
        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5 leading-relaxed">
          {cleanSnippet(note.content)}
        </p>

        {/* Metadata Footer: Tags, Task Counter, Attachments, Reminders */}
        <div className="flex flex-wrap items-center gap-2 mt-2 pt-1">
          {/* Tags */}
          {note.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-amber-600 dark:text-amber-400 font-medium"
            >
              #{tag}
            </span>
          ))}

          {/* Tasks Indicator */}
          {totalTasks > 0 && (
            <span
              className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ${
                completedTasks === totalTasks
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                  : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {completedTasks}/{totalTasks}
            </span>
          )}

          {/* Attachments Indicator */}
          {note.attachments.length > 0 && (
            <span className="text-[10px] inline-flex items-center gap-0.5 text-neutral-500 dark:text-neutral-400">
              <Paperclip className="w-3 h-3" />
              {note.attachments.length}
            </span>
          )}

          {/* Overdue or Due Date Indicator */}
          {hasOverdue ? (
            <span className="text-[10px] inline-flex items-center gap-0.5 text-rose-500 font-medium bg-rose-500/10 px-1.5 py-0.5 rounded-md">
              <AlertCircle className="w-3 h-3" />
              期限超過
            </span>
          ) : note.dueDate ? (
            <span className="text-[10px] inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <Clock className="w-3 h-3" />
              {new Date(note.dueDate).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
};
