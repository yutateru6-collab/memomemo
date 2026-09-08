export const SCHOOL_CLASSES = ['2-3', '2-9', '2-13'] as const;

export type SchoolClassId = (typeof SCHOOL_CLASSES)[number];

export interface SchoolLesson {
  id: string;
  classId: SchoolClassId;
  lessonDate: string; // YYYY-MM-DD
  lessonContent: string;
  lessonFlow: string;
  handouts: string;
  openingQuiz: string;
  nextLesson: string;
  examScopeSnapshot: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SchoolClassSettings {
  classId: SchoolClassId;
  examScope: string;
  updatedAt: number;
}
