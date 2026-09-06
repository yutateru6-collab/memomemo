import { Note } from '../types';

export const RETIRED_SAMPLE_NOTE_IDS = new Set(['sample-welcome']);

export function isRetiredSampleNoteId(id: string): boolean {
  return RETIRED_SAMPLE_NOTE_IDS.has(id);
}

export function filterRetiredSampleNotes(notes: Note[]): Note[] {
  return notes.filter((note) => !isRetiredSampleNoteId(note.id));
}
