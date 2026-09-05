import { AttachmentItem, Note, TaskItem } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidOptionalDate(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length > 0 && Number.isFinite(new Date(value).getTime()))
  );
}

function parseTask(value: unknown): TaskItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.text !== 'string') return null;
  if (typeof value.completed !== 'boolean') return null;
  if (!isValidOptionalDate(value.dueDate)) return null;

  return {
    id: value.id,
    text: value.text,
    completed: value.completed,
    ...(value.dueDate ? { dueDate: value.dueDate } : {}),
  };
}

function parseAttachment(value: unknown): AttachmentItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.name !== 'string') return null;
  if (!['image', 'pdf', 'other'].includes(String(value.type))) return null;
  if (typeof value.mimeType !== 'string') return null;
  if (!isFiniteNumber(value.size) || value.size < 0) return null;
  if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:')) return null;
  if (!isFiniteNumber(value.createdAt)) return null;

  return {
    id: value.id,
    name: value.name,
    type: value.type as AttachmentItem['type'],
    mimeType: value.mimeType,
    size: value.size,
    dataUrl: value.dataUrl,
    createdAt: value.createdAt,
  };
}

function parseNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (typeof value.title !== 'string') return null;
  if (typeof value.content !== 'string') return null;
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string')) return null;
  if (!Array.isArray(value.tasks)) return null;
  if (!Array.isArray(value.attachments)) return null;
  if (!isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt)) return null;
  if (!isFiniteNumber(value.version) || value.version < 1) return null;
  if (!isValidOptionalDate(value.dueDate)) return null;
  if (value.reminderActive !== undefined && typeof value.reminderActive !== 'boolean') return null;
  if (value.isPinned !== undefined && typeof value.isPinned !== 'boolean') return null;

  const tasks = value.tasks.map(parseTask);
  if (tasks.some((task) => task === null)) return null;

  const attachments = value.attachments.map(parseAttachment);
  if (attachments.some((attachment) => attachment === null)) return null;

  return {
    id: value.id,
    title: value.title,
    content: value.content,
    tags: Array.from(new Set(value.tags as string[])),
    tasks: tasks as TaskItem[],
    attachments: attachments as AttachmentItem[],
    ...(value.dueDate ? { dueDate: value.dueDate } : {}),
    ...(value.reminderActive !== undefined ? { reminderActive: value.reminderActive as boolean } : {}),
    ...(value.isPinned !== undefined ? { isPinned: value.isPinned as boolean } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    version: value.version,
  };
}

export function sortNotesForDisplay(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** Strict parser used for imports and remote sync payloads. */
export function parseNotesArray(value: unknown): Note[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: Note[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    const note = parseNote(item);
    if (!note || ids.has(note.id)) return null;
    ids.add(note.id);
    parsed.push(note);
  }

  return sortNotesForDisplay(parsed);
}

/** Best-effort recovery for already-corrupted local storage. Invalid entries are discarded. */
export function salvageNotesArray(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];

  const byId = new Map<string, Note>();
  for (const item of value) {
    const note = parseNote(item);
    if (!note) continue;
    const existing = byId.get(note.id);
    if (!existing || note.updatedAt > existing.updatedAt || (note.updatedAt === existing.updatedAt && note.version > existing.version)) {
      byId.set(note.id, note);
    }
  }

  return sortNotesForDisplay(Array.from(byId.values()));
}

/** Merge remote data without ever rolling back a newer local edit. */
export function mergeNotesByFreshness(localNotes: Note[], remoteNotes: Note[]): Note[] {
  const byId = new Map<string, Note>();

  for (const note of [...remoteNotes, ...localNotes]) {
    const existing = byId.get(note.id);
    if (
      !existing ||
      note.updatedAt > existing.updatedAt ||
      (note.updatedAt === existing.updatedAt && note.version >= existing.version)
    ) {
      byId.set(note.id, note);
    }
  }

  return sortNotesForDisplay(Array.from(byId.values()));
}
