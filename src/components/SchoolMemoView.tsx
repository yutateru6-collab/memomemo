import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Cloud,
  Copy,
  FileText,
  GraduationCap,
  ListChecks,
  Save,
  Trash2,
} from 'lucide-react';
import { SCHOOL_CLASSES, SchoolClassId, SchoolClassSettings, SchoolLesson } from '../schoolTypes';
import {
  deleteSchoolLesson,
  getSchoolClassSettings,
  getSchoolLessons,
  recordSchoolLessonDeletion,
  saveSchoolClassSettings,
  saveSchoolLesson,
} from '../services/schoolStorage';
import { getCloudflareConfig } from '../services/storage';
import { syncSchoolWithCloudflare } from '../services/schoolCloudSync';

interface SchoolMemoViewProps {
  initialDate?: string;
  initialClassId?: SchoolClassId;
  onOpenCalendar: (date?: string, classId?: SchoolClassId) => void;
}

type LessonDraft = Omit<SchoolLesson, 'id' | 'createdAt' | 'updatedAt' | 'version'>;
type CloudStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

const todayKey = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDate = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '日付未設定';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  });
};

const createDraft = (classId: SchoolClassId, date: string, examScope: string): LessonDraft => ({
  classId,
  lessonDate: date,
  lessonContent: '',
  lessonFlow: '',
  handouts: '',
  openingQuiz: '',
  nextLesson: '',
  examScopeSnapshot: examScope,
  completed: false,
});

const fieldClass = 'w-full min-h-24 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#1c1c1e] px-4 py-3 text-base text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500/70 resize-y';

export const SchoolMemoView: React.FC<SchoolMemoViewProps> = ({
  initialDate,
  initialClassId = '2-3',
  onOpenCalendar,
}) => {
  const [lessons, setLessons] = useState<SchoolLesson[]>([]);
  const [settings, setSettings] = useState<SchoolClassSettings[]>([]);
  const [selectedClass, setSelectedClass] = useState<SchoolClassId>(initialClassId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LessonDraft>(() => createDraft(initialClassId, initialDate || todayKey(), ''));
  const [examScopeInput, setExamScopeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('idle');

  const applyCloudResult = useCallback((result: Awaited<ReturnType<typeof syncSchoolWithCloudflare>>, classId: SchoolClassId) => {
    if (!result.success || !result.lessons || !result.settings) {
      setCloudStatus(navigator.onLine ? 'error' : 'offline');
      return;
    }
    setLessons(result.lessons);
    setSettings(result.settings);
    const scope = result.settings.find((item) => item.classId === classId)?.examScope || '';
    setExamScopeInput(scope);
    setCloudStatus('success');
  }, []);

  const runCloudSync = useCallback(async (classId: SchoolClassId) => {
    const config = getCloudflareConfig();
    if (!navigator.onLine) {
      setCloudStatus('offline');
      return;
    }
    if (!config.autoSync || !config.syncCode || !config.workerUrl.trim()) {
      setCloudStatus('idle');
      return;
    }
    setCloudStatus('syncing');
    const result = await syncSchoolWithCloudflare(config);
    applyCloudResult(result, classId);
  }, [applyCloudResult]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [loadedLessons, loadedSettings] = await Promise.all([getSchoolLessons(), getSchoolClassSettings()]);
      if (cancelled) return;
      const scope = loadedSettings.find((item) => item.classId === initialClassId)?.examScope || '';
      setLessons(loadedLessons);
      setSettings(loadedSettings);
      setSelectedClass(initialClassId);
      setExamScopeInput(scope);
      setDraft(createDraft(initialClassId, initialDate || todayKey(), scope));
      setEditingId(null);
      setLoading(false);

      const config = getCloudflareConfig();
      if (navigator.onLine && config.autoSync && config.syncCode && config.workerUrl.trim()) {
        setCloudStatus('syncing');
        const result = await syncSchoolWithCloudflare(config);
        if (cancelled) return;
        if (result.success && result.lessons && result.settings) {
          setLessons(result.lessons);
          setSettings(result.settings);
          const remoteScope = result.settings.find((item) => item.classId === initialClassId)?.examScope || '';
          setExamScopeInput(remoteScope);
          setDraft(createDraft(initialClassId, initialDate || todayKey(), remoteScope));
          setCloudStatus('success');
        } else {
          setCloudStatus(navigator.onLine ? 'error' : 'offline');
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [initialDate, initialClassId]);

  const currentExamScope = useMemo(
    () => settings.find((item) => item.classId === selectedClass)?.examScope || '',
    [settings, selectedClass]
  );
  const classLessons = useMemo(() => lessons.filter((item) => item.classId === selectedClass), [lessons, selectedClass]);
  const nextScheduledLesson = useMemo(() => {
    const today = todayKey();
    return [...classLessons]
      .filter((item) => !item.completed && item.lessonDate >= today)
      .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate))[0] || null;
  }, [classLessons]);
  const latestPreviousNext = useMemo(() => {
    const previous = classLessons
      .filter((item) => item.id !== editingId && item.lessonDate <= draft.lessonDate && item.nextLesson.trim().length > 0)
      .sort((a, b) => a.lessonDate !== b.lessonDate ? b.lessonDate.localeCompare(a.lessonDate) : b.updatedAt - a.updatedAt);
    return previous[0]?.nextLesson || '';
  }, [classLessons, draft.lessonDate, editingId]);

  const switchClass = (classId: SchoolClassId) => {
    const scope = settings.find((item) => item.classId === classId)?.examScope || '';
    setSelectedClass(classId);
    setEditingId(null);
    setExamScopeInput(scope);
    setDraft(createDraft(classId, initialDate || todayKey(), scope));
    setSaveMessage(null);
  };

  const startNewLesson = (date = initialDate || todayKey()) => {
    setEditingId(null);
    setDraft(createDraft(selectedClass, date, currentExamScope));
    setSaveMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editLesson = (lesson: SchoolLesson) => {
    setSelectedClass(lesson.classId);
    setEditingId(lesson.id);
    setDraft({
      classId: lesson.classId,
      lessonDate: lesson.lessonDate,
      lessonContent: lesson.lessonContent,
      lessonFlow: lesson.lessonFlow,
      handouts: lesson.handouts,
      openingQuiz: lesson.openingQuiz,
      nextLesson: lesson.nextLesson,
      examScopeSnapshot: lesson.examScopeSnapshot,
      completed: lesson.completed,
    });
    setSaveMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveExamScope = async () => {
    const existing = settings.find((item) => item.classId === selectedClass);
    const updated: SchoolClassSettings = {
      classId: selectedClass,
      examScope: examScopeInput,
      updatedAt: Date.now(),
      version: Math.max(1, (existing?.version || 0) + 1),
    };
    await saveSchoolClassSettings(updated);
    setSettings((current) => [updated, ...current.filter((item) => item.classId !== selectedClass)]);
    if (!editingId) setDraft((current) => ({ ...current, examScopeSnapshot: examScopeInput }));
    setSaveMessage('試験範囲を保存しました');
    void runCloudSync(selectedClass);
  };

  const saveLesson = async () => {
    if (!draft.lessonDate) {
      setSaveMessage('授業日を入力してください');
      return;
    }
    const now = Date.now();
    const existing = editingId ? lessons.find((item) => item.id === editingId) : undefined;
    const saved: SchoolLesson = {
      ...draft,
      classId: selectedClass,
      id: existing?.id || `lesson-${now}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: existing ? Math.max(1, (existing.version || 1) + 1) : 1,
    };
    await saveSchoolLesson(saved);
    setLessons((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || b.updatedAt - a.updatedAt));
    setEditingId(saved.id);
    setSaveMessage('授業メモを保存しました');
    void runCloudSync(selectedClass);
  };

  const toggleCompleted = async (lesson: SchoolLesson) => {
    const updated: SchoolLesson = {
      ...lesson,
      completed: !lesson.completed,
      updatedAt: Date.now(),
      version: Math.max(1, (lesson.version || 1) + 1),
    };
    await saveSchoolLesson(updated);
    setLessons((current) => current.map((item) => item.id === updated.id ? updated : item));
    if (editingId === updated.id) setDraft((current) => ({ ...current, completed: updated.completed }));
    void runCloudSync(updated.classId);
  };

  const removeLesson = async (lesson: SchoolLesson) => {
    if (!confirm(`${formatDate(lesson.lessonDate)}の授業メモを削除しますか？`)) return;
    recordSchoolLessonDeletion(lesson);
    await deleteSchoolLesson(lesson.id);
    setLessons((current) => current.filter((item) => item.id !== lesson.id));
    if (editingId === lesson.id) startNewLesson();
    void runCloudSync(lesson.classId);
  };

  if (loading) {
    return <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-black flex items-center justify-center text-neutral-500">学校メモを読み込み中…</div>;
  }

  const cloudLabel = cloudStatus === 'syncing' ? '同期中…' : cloudStatus === 'success' ? '同期済み' : cloudStatus === 'error' ? '同期エラー' : cloudStatus === 'offline' ? 'オフライン' : '端末保存';

  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-black text-neutral-900 dark:text-white pb-28">
      <div className="sticky top-0 z-30 bg-[#f2f2f7]/95 dark:bg-black/95 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">授業準備・履歴</p>
              <h1 className="text-2xl font-bold tracking-tight">学校メモ</h1>
              <span data-testid="school-cloud-status" className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                <Cloud className="w-3 h-3" /> {cloudLabel}
              </span>
            </div>
            <button type="button" onClick={() => onOpenCalendar(draft.lessonDate, selectedClass)} className="min-h-11 px-3 rounded-xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-700 inline-flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="w-4 h-4 text-amber-500" />カレンダー
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2" data-testid="school-class-tabs">
            {SCHOOL_CLASSES.map((classId) => (
              <button key={classId} type="button" data-school-class={classId} aria-pressed={selectedClass === classId} onClick={() => switchClass(classId)} className={`min-h-11 rounded-xl font-bold transition-colors ${selectedClass === classId ? 'bg-amber-500 text-black shadow-sm' : 'bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200'}`}>
                {classId}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {nextScheduledLesson && (
          <section className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">次の授業</p>
                <p className="text-lg font-bold mt-0.5">{formatDate(nextScheduledLesson.lessonDate)}・{selectedClass}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1 whitespace-pre-wrap">{nextScheduledLesson.lessonContent || '授業内容はまだ未入力です'}</p>
              </div>
              <button type="button" onClick={() => editLesson(nextScheduledLesson)} className="min-h-11 px-3 rounded-xl bg-amber-500 text-black text-sm font-bold">開く</button>
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2 mb-2"><GraduationCap className="w-5 h-5 text-amber-500" /><h2 className="font-bold" data-testid="current-exam-scope-title">{selectedClass}　現在の試験範囲</h2></div>
            <textarea data-testid="school-exam-scope" value={examScopeInput} onChange={(e) => setExamScopeInput(e.target.value)} placeholder="例：Vision Quest 名詞・冠詞〜時制② / Workbook p.30〜45" className={fieldClass} />
            <button type="button" onClick={() => void saveExamScope()} className="mt-3 min-h-11 px-4 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-sm inline-flex items-center gap-2"><Save className="w-4 h-4" />試験範囲を保存</button>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs text-neutral-500">{editingId ? '授業メモを編集中' : '新しい授業メモ'}</p><h2 className="text-xl font-bold">{selectedClass}・{formatDate(draft.lessonDate)}</h2></div>
              <button type="button" onClick={() => startNewLesson()} className="min-h-11 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold">＋ 新規</button>
            </div>

            <label className="block"><span className="text-sm font-bold">授業日</span><input data-testid="school-lesson-date" type="date" value={draft.lessonDate} onChange={(e) => setDraft((current) => ({ ...current, lessonDate: e.target.value }))} className="mt-1.5 w-full min-h-11 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 text-base" /></label>

            {latestPreviousNext && (
              <button type="button" onClick={() => setDraft((current) => ({ ...current, lessonContent: latestPreviousNext }))} className="w-full min-h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-700 dark:text-sky-300 px-3 py-2 text-left flex items-start gap-2">
                <Copy className="w-4 h-4 mt-0.5 shrink-0" /><span><strong>前回の「次回」を今回へコピー</strong><span className="block text-sm mt-0.5 whitespace-pre-wrap">{latestPreviousNext}</span></span>
              </button>
            )}

            <Field testId="school-lesson-content" icon={<BookOpen className="w-4 h-4" />} label="何の授業をするか" value={draft.lessonContent} onChange={(value) => setDraft((current) => ({ ...current, lessonContent: value }))} placeholder="例：時制② 現在完了・過去完了" />
            <Field testId="school-lesson-flow" icon={<ListChecks className="w-4 h-4" />} label="どう進めるか" value={draft.lessonFlow} onChange={(value) => setDraft((current) => ({ ...current, lessonFlow: value }))} placeholder={'例：前回復習 → 解説 → 例題 → 演習\n板書するポイントもここに追記できます'} />
            <Field testId="school-handouts" icon={<FileText className="w-4 h-4" />} label="何を配布するか" value={draft.handouts} onChange={(value) => setDraft((current) => ({ ...current, handouts: value }))} placeholder="例：時制②プリント、解答冊子" />
            <Field testId="school-opening-quiz" icon={<ClipboardList className="w-4 h-4" />} label="最初の小テスト" value={draft.openingQuiz} onChange={(value) => setDraft((current) => ({ ...current, openingQuiz: value }))} placeholder="例：単語730〜750 / 5分" />
            <Field testId="school-next-lesson" icon={<ChevronDown className="w-4 h-4" />} label="次回何をするか" value={draft.nextLesson} onChange={(value) => setDraft((current) => ({ ...current, nextLesson: value }))} placeholder="例：Workbook Exercise 3から" />
            <Field testId="school-exam-snapshot" icon={<GraduationCap className="w-4 h-4" />} label="この授業時点の試験範囲" value={draft.examScopeSnapshot} onChange={(value) => setDraft((current) => ({ ...current, examScopeSnapshot: value }))} placeholder="上の現在の試験範囲が新規授業に自動で入ります" />

            <label className="flex items-center gap-3 min-h-11 rounded-xl bg-neutral-100 dark:bg-neutral-900 px-3 cursor-pointer"><input type="checkbox" checked={draft.completed} onChange={(e) => setDraft((current) => ({ ...current, completed: e.target.checked }))} className="w-5 h-5 accent-amber-500" /><span className="font-semibold">この授業は実施済み</span></label>

            <div className="flex flex-wrap items-center gap-2">
              <button data-testid="save-school-lesson" type="button" onClick={() => void saveLesson()} className="min-h-12 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold inline-flex items-center gap-2"><Save className="w-5 h-5" />授業メモを保存</button>
              {editingId && <button type="button" onClick={() => { const lesson = lessons.find((item) => item.id === editingId); if (lesson) void toggleCompleted(lesson); }} className="min-h-12 px-4 rounded-xl border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold inline-flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />授業済み切替</button>}
            </div>
            {saveMessage && <p data-testid="school-save-message" className="text-sm font-semibold text-amber-700 dark:text-amber-300">{saveMessage}</p>}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{selectedClass} の授業履歴</h2><span className="text-xs text-neutral-500">{classLessons.length}件</span></div>
          {classLessons.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-6 text-center text-neutral-500">まだ授業メモはありません。</div>
          ) : classLessons.map((lesson) => (
            <article key={lesson.id} data-school-lesson-id={lesson.id} className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => editLesson(lesson)} className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-bold">{formatDate(lesson.lessonDate)}</span><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${lesson.completed ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>{lesson.completed ? '授業済み' : '予定'}</span></div>
                  <p className="mt-1 text-sm whitespace-pre-wrap break-words text-neutral-700 dark:text-neutral-200">{lesson.lessonContent || '授業内容未入力'}</p>
                  {lesson.nextLesson && <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">次回：{lesson.nextLesson}</p>}
                </button>
                <button type="button" aria-label="授業メモを削除" onClick={() => void removeLesson(lesson)} className="min-w-11 min-h-11 rounded-xl inline-flex items-center justify-center text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
};

interface FieldProps { testId: string; icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; placeholder: string; }
const Field: React.FC<FieldProps> = ({ testId, icon, label, value, onChange, placeholder }) => (
  <label className="block"><span className="flex items-center gap-2 text-sm font-bold mb-1.5 text-neutral-800 dark:text-neutral-200"><span className="text-amber-500">{icon}</span>{label}</span><textarea data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} /></label>
);
