import { Note } from '../types';

export const TRASH_RETENTION_MS = 60 * 60 * 1000;

export function isNoteTrashed(note: Note): boolean {
  return typeof note.trashedAt === 'number';
}

export function isTrashExpired(note: Note, now: number = Date.now()): boolean {
  return typeof note.trashedAt === 'number' && now - note.trashedAt >= TRASH_RETENTION_MS;
}

export function trashRemainingMs(note: Note, now: number = Date.now()): number {
  if (typeof note.trashedAt !== 'number') return TRASH_RETENTION_MS;
  return Math.max(0, TRASH_RETENTION_MS - (now - note.trashedAt));
}
