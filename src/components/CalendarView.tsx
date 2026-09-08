import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  NotebookPen,
} from 'lucide-react';
import { Note } from '../types';
import { getAllNotes } from '../services/storage';
import { getSchoolLessons } from '../services/schoolStorage';
import { SchoolClassId, SchoolLesson } from '../schoolTypes';

interface CalendarViewProps {
  initialDate?: string;
  onOpenSchool: (date?: string, classId?: SchoolClassId) => void;
  onOpenMemo: () => void;
}

type CalendarEvent =
  | { id: string; date: string; type: 'school'; title: string; detail: string; lesson: SchoolLesson }
  | { id: string; date: string; type: 'memo'; title: string; detail: string; note: Note };

const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dateFromKey = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const dueDateKey = (value?: string) => {
  if (!value) return null;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? dateKey(parsed) : null;
};

const formatSelectedDate = (value: string) => {
  const date = dateFromKey(value);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

export const CalendarView: React.FC<CalendarViewProps> = ({
  initialDate,
  onOpenSchool,
  onOpenMemo,
}) => {
  const initial = dateFromKey(initialDate);
  const now = new Date();
  const [monthCursor, setMonthCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(initial));
  const [notes, setNotes] = useState<Note[]>([]);
  const [lessons, setLessons] = useState<SchoolLesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [loadedNotes, loadedLessons] = await Promise.all([getAllNotes(), getSchoolLessons()]);
      if (cancelled) return;
      setNotes(loadedNotes.filter((note) => !note.trashedAt));
      setLessons(loadedLessons);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const events = useMemo<CalendarEvent[]>(() => {
    const all: CalendarEvent[] = [];
    for (const lesson of lessons) {
      all.push({
        id: `school-${lesson.id}`,
        date: lesson.lessonDate,
        type: 'school',
        title: `${lesson.classId} 授業`,
        detail: lesson.lessonContent || '授業内容未入力',
        lesson,
      });
    }
    for (const note of notes) {
      const noteDate = dueDateKey(note.dueDate);
      if (noteDate) {
        all.push({
          id: `memo-${note.id}`,
          date: noteDate,
          type: 'memo',
          title: note.title || 'メモ',
          detail: 'メモの期限・リマインダー',
          note,
        });
      }
    }
    return all;
  }, [lessons, notes]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const current = map.get(event.date) || [];
      current.push(event);
      map.set(event.date, current);
    }
    return map;
  }, [events]);

  const gridDates = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return d;
    });
  }, [monthCursor]);

  const selectedEvents = eventsByDate.get(selectedDate) || [];
  const monthLabel = monthCursor.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
  const today = dateKey(now);

  return (
    <div className="min-h-[100dvh] bg-[#f2f2f7] dark:bg-black text-neutral-900 dark:text-white pb-28">
      <header className="sticky top-0 z-30 bg-[#f2f2f7]/95 dark:bg-black/95 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">予定・期限をまとめて確認</p>
              <h1 className="text-2xl font-bold tracking-tight">カレンダー</h1>
            </div>
            <button
              type="button"
              onClick={() => onOpenSchool(selectedDate)}
              className="min-h-11 px-3 rounded-xl bg-amber-500 text-black text-sm font-bold inline-flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              この日に授業追加
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        <section className="rounded-3xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              aria-label="前の月"
              onClick={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              className="min-w-11 min-h-11 rounded-xl inline-flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h2 className="text-lg font-bold">{monthLabel}</h2>
              <button
                type="button"
                onClick={() => {
                  setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedDate(today);
                }}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400"
              >
                今日へ戻る
              </button>
            </div>
            <button
              type="button"
              aria-label="次の月"
              onClick={() => setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              className="min-w-11 min-h-11 rounded-xl inline-flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 px-2 pt-2 text-center text-xs font-bold text-neutral-500">
            {['日', '月', '火', '水', '木', '金', '土'].map((label) => (
              <div key={label} className="py-2">{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 p-2 pt-0 gap-1">
            {gridDates.map((date) => {
              const key = dateKey(date);
              const dayEvents = eventsByDate.get(key) || [];
              const inMonth = date.getMonth() === monthCursor.getMonth();
              const selected = key === selectedDate;
              const isToday = key === today;
              return (
                <button
                  key={key}
                  type="button"
                  data-calendar-date={key}
                  onClick={() => setSelectedDate(key)}
                  className={`min-h-16 sm:min-h-20 rounded-xl p-1.5 text-left border transition-colors ${
                    selected
                      ? 'border-amber-500 bg-amber-500/12'
                      : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  } ${inMonth ? '' : 'opacity-35'}`}
                >
                  <span className={`w-7 h-7 inline-flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-amber-500 text-black' : ''}`}>
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className={`truncate rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-semibold ${
                          event.type === 'school'
                            ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                            : 'bg-sky-500/15 text-sky-800 dark:text-sky-200'
                        }`}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && <div className="text-[9px] text-neutral-500 pl-1">+{dayEvents.length - 2}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2" data-testid="calendar-day-events">
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-xs text-neutral-500">選択中</p>
              <h2 className="text-lg font-bold">{formatSelectedDate(selectedDate)}</h2>
            </div>
            <span className="text-xs text-neutral-500">{selectedEvents.length}件</span>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] p-5 text-neutral-500">予定を読み込み中…</div>
          ) : selectedEvents.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-6 text-center">
              <CalendarDays className="w-8 h-8 mx-auto text-neutral-400" />
              <p className="mt-2 text-sm text-neutral-500">この日の予定・期限はありません。</p>
            </div>
          ) : (
            selectedEvents.map((event) => (
              <article
                key={event.id}
                data-calendar-event={event.id}
                className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center ${event.type === 'school' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300' : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'}`}>
                    {event.type === 'school' ? <BookOpen className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold break-words">{event.title}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 whitespace-pre-wrap break-words">{event.detail}</p>
                    <button
                      type="button"
                      onClick={() => event.type === 'school' ? onOpenSchool(event.date, event.lesson.classId) : onOpenMemo()}
                      className="mt-3 min-h-11 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-semibold inline-flex items-center gap-2"
                    >
                      {event.type === 'school' ? <BookOpen className="w-4 h-4" /> : <NotebookPen className="w-4 h-4" />}
                      {event.type === 'school' ? '学校メモを開く' : 'メモ画面へ'}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
};
