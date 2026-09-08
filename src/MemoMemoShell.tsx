import React, { useState } from 'react';
import { BookOpen, CalendarDays, NotebookPen } from 'lucide-react';
import App from './App';
import { SchoolMemoView } from './components/SchoolMemoView';
import { CalendarView } from './components/CalendarView';

type AppSection = 'memo' | 'school' | 'calendar';

export default function MemoMemoShell() {
  const [section, setSection] = useState<AppSection>('memo');
  const [schoolDate, setSchoolDate] = useState<string | undefined>(undefined);

  const openSchool = (date?: string) => {
    setSchoolDate(date);
    setSection('school');
  };

  return (
    <div className="relative min-h-[100dvh] bg-[#f2f2f7] dark:bg-black">
      {section === 'memo' && <App />}
      {section === 'school' && (
        <SchoolMemoView
          key={schoolDate || 'school-default'}
          initialDate={schoolDate}
          onOpenCalendar={(date) => {
            if (date) setSchoolDate(date);
            setSection('calendar');
          }}
        />
      )}
      {section === 'calendar' && (
        <CalendarView
          onOpenSchool={openSchool}
          onOpenMemo={() => setSection('memo')}
        />
      )}

      <nav
        aria-label="メインナビゲーション"
        className="fixed z-[100] left-1/2 -translate-x-1/2 bottom-[max(10px,env(safe-area-inset-bottom))] w-[min(92vw,390px)] rounded-2xl border border-neutral-300/80 dark:border-neutral-700/80 bg-white/95 dark:bg-[#1c1c1e]/95 shadow-2xl backdrop-blur-xl p-1.5"
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
            onClick={() => openSchool(schoolDate)}
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
