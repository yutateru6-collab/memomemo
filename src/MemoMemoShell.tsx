import React, { useState } from 'react';
import { BookOpen, CalendarDays, Monitor, NotebookPen } from 'lucide-react';
import App from './App';
import { SchoolMemoView } from './components/SchoolMemoView';
import { CalendarView } from './components/CalendarView';
import { SchoolClassId } from './schoolTypes';

type AppSection = 'memo' | 'school' | 'calendar';

export default function MemoMemoShell() {
  const [section, setSection] = useState<AppSection>('memo');
  const [schoolDate, setSchoolDate] = useState<string | undefined>(undefined);
  const [schoolClassId, setSchoolClassId] = useState<SchoolClassId>('2-3');

  const openSchool = (date?: string, classId?: SchoolClassId) => {
    if (date) setSchoolDate(date);
    if (classId) setSchoolClassId(classId);
    setSection('school');
  };

  return (
    <div className="memomemo-shell relative min-h-[100dvh] bg-[#f2f2f7] dark:bg-black lg:flex">
      <aside
        aria-label="PC用メインナビゲーション"
        className="desktop-sidebar hidden lg:flex lg:w-[232px] xl:w-[252px] shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-[#111113]/95 backdrop-blur-xl"
      >
        <div className="sticky top-0 h-[100dvh] w-full px-4 py-5 flex flex-col">
          <div className="px-2 pb-5 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-black inline-flex items-center justify-center shadow-sm">
                <NotebookPen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">MEMOMEMO</p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">PCワークスペース</p>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <DesktopNavButton
              active={section === 'memo'}
              label="メモ"
              description="一覧と本文を同時に表示"
              icon={<NotebookPen className="w-5 h-5" />}
              onClick={() => setSection('memo')}
            />
            <DesktopNavButton
              active={section === 'school'}
              label="学校"
              description="授業準備・履歴を管理"
              icon={<BookOpen className="w-5 h-5" />}
              onClick={() => openSchool(schoolDate, schoolClassId)}
            />
            <DesktopNavButton
              active={section === 'calendar'}
              label="カレンダー"
              description="予定と期限を一覧確認"
              icon={<CalendarDays className="w-5 h-5" />}
              onClick={() => setSection('calendar')}
            />
          </div>

          <div className="mt-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/70 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-neutral-200">
              <Monitor className="w-4 h-4 text-amber-500" />
              PC最適化表示
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              広い画面ではサイドバーと横並び表示を使い、スマホでは従来の下部ナビに自動で切り替わります。
            </p>
          </div>
        </div>
      </aside>

      <main className="desktop-content min-w-0 flex-1">
        <div className={`app-section app-section-${section} min-h-[100dvh]`}>
          {section === 'memo' && <App />}
          {section === 'school' && (
            <SchoolMemoView
              key={`${schoolClassId}-${schoolDate || 'school-default'}`}
              initialDate={schoolDate}
              initialClassId={schoolClassId}
              onOpenCalendar={(date, classId) => {
                if (date) setSchoolDate(date);
                if (classId) setSchoolClassId(classId);
                setSection('calendar');
              }}
            />
          )}
          {section === 'calendar' && (
            <CalendarView
              initialDate={schoolDate}
              onOpenSchool={openSchool}
              onOpenMemo={() => setSection('memo')}
            />
          )}
        </div>
      </main>

      <nav
        aria-label="メインナビゲーション"
        className="lg:hidden fixed z-[40] left-1/2 -translate-x-1/2 bottom-[max(10px,env(safe-area-inset-bottom))] w-[min(92vw,390px)] rounded-2xl border border-neutral-300/80 dark:border-neutral-700/80 bg-white/95 dark:bg-[#1c1c1e]/95 shadow-2xl backdrop-blur-xl p-1.5"
      >
        <div className="grid grid-cols-3 gap-1">
          <NavButton
            active={section === 'memo'}
            label="メモ"
            icon={<NotebookPen className="w-4 h-4" />}
            onClick={() => setSection('memo')}
          />
          <NavButton
            active={section === 'school'}
            label="学校"
            icon={<BookOpen className="w-4 h-4" />}
            onClick={() => openSchool(schoolDate, schoolClassId)}
          />
          <NavButton
            active={section === 'calendar'}
            label="カレンダー"
            icon={<CalendarDays className="w-4 h-4" />}
            onClick={() => setSection('calendar')}
          />
        </div>
      </nav>
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ active, label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
      active
        ? 'bg-amber-500 text-black'
        : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface DesktopNavButtonProps extends NavButtonProps {
  description: string;
}

const DesktopNavButton: React.FC<DesktopNavButtonProps> = ({
  active,
  label,
  description,
  icon,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`w-full min-h-16 rounded-2xl px-3 py-2.5 flex items-center gap-3 text-left transition-colors border ${
      active
        ? 'bg-amber-500 text-black border-amber-500 shadow-sm'
        : 'bg-transparent text-neutral-700 dark:text-neutral-200 border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:border-neutral-200 dark:hover:border-neutral-800'
    }`}
  >
    <span className={`w-9 h-9 shrink-0 rounded-xl inline-flex items-center justify-center ${active ? 'bg-black/10' : 'bg-neutral-100 dark:bg-neutral-800 text-amber-500'}`}>
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-black">{label}</span>
      <span className={`block mt-0.5 text-[10px] leading-tight ${active ? 'text-black/65' : 'text-neutral-500 dark:text-neutral-400'}`}>
        {description}
      </span>
    </span>
  </button>
);
