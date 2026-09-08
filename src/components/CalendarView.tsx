import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Clock,
  FileText,
  School,
} from 'lucide-react';
import { Note } from '../types';
import { getSchoolLessons, SchoolClassId } from '../services/schoolData';

interface CalendarViewProps {
  notes: Note[];
  onOpenSchoolLesson: (classId: SchoolClassId, noteId: string) => void;
}

type CalendarEvent =
  | { kind: 'school'; date: string; title: string; subtitle: string; noteId: string; classId: SchoolClassId }
  | { kind: 'note'; date: string; title: string; subtitle: string; noteId: string }
  | { kind: 'task'; date: string; title: string; subtitle: string; noteId: string; completed: boolean };

function toIsoDay(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayIsoDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatAgendaDay(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  return date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' });
}

export const CalendarView: React.FC<CalendarViewProps> = ({ notes, onOpenSchoolLesson }) => {
  const today = todayIsoDay();
  const initial = new Date(`${today}T00:00:00`);
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today);

  const events = useMemo<CalendarEvent[]>(() => {
    const activeNotes = notes.filter((note) => !note.trashedAt);
    const schoolIds = new Set<string>();
    const result: CalendarEvent[] = [];

    for (const lesson of getSchoolLessons(activeNotes)) {
      schoolIds.add(lesson.note.id);
      result.push({
        kind: 'school',
        date: lesson.lessonDate,
        title: `${lesson.classId} 授業`,
        subtitle: lesson.lessonContent || '授業内容未入力',
        noteId: lesson.note.id,
        classId: lesson.classId,
      });
    }

    for (const note of activeNotes) {
      if (schoolIds.has(note.id)) continue;
      if (note.dueDate) {
        const day = toIsoDay(note.dueDate);
        if (day) {
          result.push({
            kind: 'note',
            date: day,
            title: note.title || '無題のメモ',
            subtitle: 'メモの期限・リマインダー',
            noteId: note.id,
          });
        }
      }
      for (const task of note.tasks) {
        if (!task.dueDate) continue;
        const day = toIsoDay(task.dueDate);
        if (!day) continue;
        result.push({
          kind: 'task',
          date: day,
          title: task.text || '未完了タスク',
          subtitle: note.title || '無題のメモ',
          noteId: note.id,
          completed: task.completed,
        });
      }
    }

    return result.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  }, [notes]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const bucket = map.get(event.date) || [];
      bucket.push(event);
      map.set(event.date, bucket);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<{ day: string | null; dateNumber: number | null }> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push({ day: null, dateNumber: null });
    for (let d = 1; d <= lastDay; d += 1) {
      cells.push({
        day: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dateNumber: d,
      });
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, dateNumber: null });
    return cells;
  }, [month]);

  const selectedEvents = eventsByDay.get(selectedDay) || [];

  const changeMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    const candidate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    setSelectedDay(monthKey(next) === monthKey(initial) ? today : candidate);
  };

  return (
    <div id="calendar-view" className="h-full overflow-y-auto bg-[#f2f2f7] dark:bg-black text-neutral-900 dark:text-white pb-28">
      <div className="sticky top-0 z-20 bg-[#f2f2f7]/92 dark:bg-black/92 backdrop-blur-xl border-b border-neutral-200/70 dark:border-neutral-800/80">
        <div className="px-4 pt-safe-top pb-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-black flex items-center justify-center shadow-sm">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">カレンダー</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">授業・メモ期限・タスクをまとめて確認</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <section className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-3 border-b border-neutral-100 dark:border-neutral-800">
            <button type="button" onClick={() => changeMonth(-1)} className="min-w-11 min-h-11 rounded-xl inline-flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="前の月">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="text-lg font-bold">{month.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}</p>
              <button
                type="button"
                onClick={() => {
                  setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
                  setSelectedDay(today);
                }}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400"
              >
                今日へ戻る
              </button>
            </div>
            <button type="button" onClick={() => changeMonth(1)} className="min-w-11 min-h-11 rounded-xl inline-flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="次の月">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 px-2 pt-2 text-center text-xs font-semibold text-neutral-400">
            {['日', '月', '火', '水', '木', '金', '土'].map((label) => <div key={label} className="py-1">{label}</div>)}
          </div>
          <div className="grid grid-cols-7 p-2 gap-1">
            {days.map((cell, index) => {
              if (!cell.day || !cell.dateNumber) return <div key={`blank-${index}`} className="aspect-square" />;
              const dayEvents = eventsByDay.get(cell.day) || [];
              const isSelected = selectedDay === cell.day;
              const isToday = cell.day === today;
              const schoolCount = dayEvents.filter((event) => event.kind === 'school').length;
              const otherCount = dayEvents.length - schoolCount;
              return (
                <button
                  key={cell.day}
                  type="button"
                  data-testid={`calendar-day-${cell.day}`}
                  onClick={() => setSelectedDay(cell.day as string)}
                  className={`aspect-square min-h-11 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                    isSelected
                      ? 'bg-amber-500 text-black'
                      : isToday
                      ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <span className="text-sm font-bold">{cell.dateNumber}</span>
                  <span className="flex items-center gap-1 h-2">
                    {schoolCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {otherCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-base font-bold">{formatAgendaDay(selectedDay)}</h2>
            <span className="text-xs text-neutral-400">{selectedEvents.length}件</span>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-neutral-500 dark:text-neutral-400">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="font-semibold">予定はありません</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((event, index) => {
                const icon = event.kind === 'school' ? <School className="w-4 h-4" /> : event.kind === 'task' ? <CheckSquare className="w-4 h-4" /> : <Clock className="w-4 h-4" />;
                const body = (
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${event.kind === 'school' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}>
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold text-sm ${event.kind === 'task' && event.completed ? 'line-through opacity-60' : ''}`}>{event.title}</p>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5 whitespace-pre-wrap">{event.subtitle}</p>
                    </div>
                    {event.kind === 'school' && <ChevronRight className="w-4 h-4 text-neutral-400 mt-2" />}
                  </div>
                );

                return event.kind === 'school' ? (
                  <button
                    key={`${event.kind}-${event.noteId}-${index}`}
                    type="button"
                    onClick={() => onOpenSchoolLesson(event.classId, event.noteId)}
                    className="w-full text-left rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-3 shadow-sm hover:border-amber-300 dark:hover:border-amber-500/50"
                  >
                    {body}
                  </button>
                ) : (
                  <div key={`${event.kind}-${event.noteId}-${index}`} className="rounded-2xl bg-white dark:bg-[#1c1c1e] border border-neutral-200 dark:border-neutral-800 p-3 shadow-sm">
                    {body}
                    <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-400 inline-flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      メモ画面で編集できます
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
