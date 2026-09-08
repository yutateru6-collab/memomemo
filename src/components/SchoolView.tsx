import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Copy,
  FileText,
  Plus,
  School,
  Trash2,
} from 'lucide-react';
import { Note } from '../types';
import {
  createSchoolLessonNote,
  getSchoolLessons,
  SchoolClassId,
  SCHOOL_CLASSES,
  SchoolLessonFields,
  todayIsoDay,
  updateSchoolLessonNote,
} from '../services/schoolData';

interface SchoolViewProps {
  notes: Note[];
  selectedClassId: SchoolClassId;
  selectedLessonId: string | null;
  onSelectClass: (classId: SchoolClassId) => void;
  onSelectLesson: (noteId: string | null) => void;
  onSaveNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
}

const fieldMeta: Array<{
  key: keyof Pick<SchoolLessonFields, 'lessonContent' | 'lessonFlow' | 'handouts' | 'openingQuiz' | 'nextLesson' | 'examScope'>;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  { key: 'lessonContent', label: '何の授業をする？', hint: '例：Vision Quest 時制② 現在完了', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'lessonFlow', label: 'どう進める？', hint: '例：前回復習 → 解説 → 例題 → 演習', icon: <ChevronRight className="w-4 h-4" /> },
  { key: 'handouts', label: '何を配布する？', hint: '例：時制②まとめプリント、演習プリント', icon: <FileText className="w-4 h-4" /> },
  { key: 'openingQuiz', label: '最初の小テスト', hint: '例：単語 730〜750', icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'nextLesson', label: '次回何をする？', hint: '例：Workbook Exercise 3から', icon: <ChevronRight className="w-4 h-4" /> },
  { key: 'examScope', label: '今回の試験範囲', hint: '例：Vision Quest 名詞・冠詞〜時制②', icon: <CheckCircle2 className="w-4 h-4" /> },
];

function formatJapaneseDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return day;
  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
}

export const SchoolView: React.FC<SchoolViewProps> = ({
  notes,
  selectedClassId,
  selectedLessonId,
  onSelectClass,
  onSelectLesson,
  onSaveNote,
  onDeleteNote,
}) => {
  const [newLessonDate, setNewLessonDate] = useState(todayIsoDay());
  const lessons = useMemo(() => getSchoolLessons(notes), [notes]);
  const classLessons = useMemo(
    () => lessons.filter((lesson) => lesson.classId === selectedClassId),
    [lessons, selectedClassId]
  );
  const selectedLesson = useMemo(
    () => classLessons.find((lesson) => lesson.note.id === selectedLessonId) || null,
    [classLessons, selectedLessonId]
  );

  useEffect(() => {
    if (selectedLessonId && selectedLesson) return;
    onSelectLesson(classLessons[0]?.note.id ?? null);
  }, [classLessons, onSelectLesson, selectedLesson, selectedLessonId]);

  const currentExamScope = useMemo(
    () => classLessons.find((lesson) => lesson.examScope.trim())?.examScope.trim() || '',
    [classLessons]
  );

  const previousLesson = useMemo(() => {
    if (!selectedLesson) return null;
    return (
      classLessons.find(
        (lesson) =>
          lesson.note.id !== selectedLesson.note.id &&
          lesson.lessonDate < selectedLesson.lessonDate &&
          lesson.nextLesson.trim()
      ) || null
    );
  }, [classLessons, selectedLesson]);

  const createLesson = () => {
    const existing = classLessons.find((lesson) => lesson.lessonDate === newLessonDate);
    if (existing) {
      onSelectLesson(existing.note.id);
      return;
    }

    const fields: SchoolLessonFields = {
      classId: selectedClassId,
      lessonDate: newLessonDate,
      lessonContent: '',
      lessonFlow: '',
      handouts: '',
      openingQuiz: '',
      nextLesson: '',
      examScope: currentExamScope,
      completed: false,
    };
    const note = createSchoolLessonNote(fields);
    onSaveNote(note);
    onSelectLesson(note.id);
  };

  const updateSelected = (patch: Partial<SchoolLessonFields>) => {
    if (!selectedLesson) return;
    const fields: SchoolLessonFields = {
      classId: selectedLesson.classId,
      lessonDate: selectedLesson.lessonDate,
      lessonContent: selectedLesson.lessonContent,
      lessonFlow: selectedLesson.lessonFlow,
      handouts: selectedLesson.handouts,
      openingQuiz: selectedLesson.openingQuiz,
      nextLesson: selectedLesson.nextLesson,
      examScope: selectedLesson.examScope,
      completed: selectedLesson.completed,
      ...patch,
    };
    onSaveNote(updateSchoolLessonNote(selectedLesson.note, fields));
  };

  return (
    <div id="school-view" className="h-full overflow-y-auto bg-[#f2f2f7] dark:bg-black text-neutral-900 dark:text-white pb-28">
      <div className="sticky top-0 z-20 bg-[#f2f2f7]/92 dark:bg-black/92 backdrop-blur-xl border-b border-neutral-200/70 dark:border-neutral-800/80">
        <div className="px-4 pt-safe-top pb-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-black flex items-center justify-center shadow-sm">
              <School className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">学校メモ</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">授業準備と次回への引き継ぎ</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="クラス選択">
            {SCHOOL_CLASSES.map((classId) => (
              <button
                key={classId}
                type="button"
                data-testid={`school-class-${classId}`}
                onClick={() => {
                  onSelectClass(classId);
                  onSelectLesson(null);
                }}
                className={`min-h-11 rounded-xl font-bold text-base transition-colors ${
                  selectedClassId === classId
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'bg-white dark:bg-[#1c1c1e] text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800'
                }`}
              >
                {classId}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <section className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">現在の試験範囲</p>
              <p className="text-sm mt-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
                {currentExamScope || 'まだ登録されていません'}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">
              {selectedClassId}
            </span>
          </div>
        </section>

        <section className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[180px] text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              授業日
              <input
                data-testid="school-new-lesson-date"
                type="date"
                value={newLessonDate}
                onChange={(e) => setNewLessonDate(e.target.value)}
                className="mt-1 w-full min-h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 px-3 text-base text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <button
              data-testid="school-create-lesson"
              type="button"
              onClick={createLesson}
              className="min-h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold inline-flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              授業メモを作成
            </button>
          </div>
        </section>

        {selectedLesson ? (
          <section className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">編集中</p>
                <h2 className="text-xl font-bold">{selectedClassId} ・ {formatJapaneseDay(selectedLesson.lessonDate)}</h2>
              </div>
              <button
                type="button"
                onClick={() => updateSelected({ completed: !selectedLesson.completed })}
                className={`min-h-11 px-3 rounded-xl inline-flex items-center gap-2 font-semibold text-sm ${
                  selectedLesson.completed
                    ? 'bg-emerald-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {selectedLesson.completed ? '授業済み' : '授業前'}
              </button>
            </div>

            <div className="p-4 space-y-4">
              <label className="block text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                授業日を変更
                <input
                  type="date"
                  value={selectedLesson.lessonDate}
                  onChange={(e) => updateSelected({ lessonDate: e.target.value })}
                  className="mt-1 w-full min-h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 px-3 text-base text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>

              {previousLesson?.nextLesson.trim() && (
                <div className="rounded-xl border border-amber-300/70 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">前回の「次回」</p>
                  <p className="text-sm mt-1 whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">{previousLesson.nextLesson}</p>
                  <button
                    type="button"
                    onClick={() => updateSelected({ lessonContent: previousLesson.nextLesson })}
                    className="mt-2 min-h-11 px-3 rounded-xl bg-amber-500 text-black text-sm font-bold inline-flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    今回の授業内容にコピー
                  </button>
                </div>
              )}

              {fieldMeta.map((field) => (
                <label key={field.key} className="block">
                  <span className="flex items-center gap-2 text-sm font-bold text-neutral-800 dark:text-neutral-100">
                    <span className="text-amber-500">{field.icon}</span>
                    {field.label}
                  </span>
                  <textarea
                    data-testid={`school-field-${field.key}`}
                    value={selectedLesson[field.key]}
                    onChange={(e) => updateSelected({ [field.key]: e.target.value } as Partial<SchoolLessonFields>)}
                    placeholder={field.hint}
                    rows={field.key === 'lessonFlow' || field.key === 'examScope' ? 4 : 3}
                    className="mt-1.5 w-full resize-y rounded-xl bg-neutral-100 dark:bg-neutral-800 px-3 py-2.5 text-base leading-relaxed text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
              ))}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm('この授業メモを完全に削除しますか？')) return;
                    onDeleteNote(selectedLesson.note);
                    onSelectLesson(null);
                  }}
                  className="min-h-11 px-3 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-2 font-semibold text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  この授業メモを削除
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-neutral-500 dark:text-neutral-400">
            <School className="w-8 h-8 mx-auto mb-2 text-amber-500" />
            <p className="font-semibold">授業メモがまだありません</p>
            <p className="text-sm mt-1">上の日付を選んで作成してください。</p>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-200">授業履歴</h2>
            <span className="text-xs text-neutral-400">{classLessons.length}件</span>
          </div>
          <div className="space-y-2">
            {classLessons.map((lesson) => (
              <button
                key={lesson.note.id}
                type="button"
                onClick={() => onSelectLesson(lesson.note.id)}
                className={`w-full text-left rounded-2xl border p-3 transition-colors ${
                  lesson.note.id === selectedLessonId
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10'
                    : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#1c1c1e]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{formatJapaneseDay(lesson.lessonDate)}</p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-300 truncate mt-0.5">
                      {lesson.lessonContent || '授業内容未入力'}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-full ${
                    lesson.completed
                      ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'
                  }`}>
                    {lesson.completed ? '授業済み' : '予定'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
