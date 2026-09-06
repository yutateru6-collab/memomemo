from pathlib import Path

# Shared retired-sample policy.
retired = Path('src/services/retiredSamples.ts')
retired.write_text("""import { Note } from '../types';

export const RETIRED_SAMPLE_NOTE_IDS = new Set(['sample-welcome']);

export function isRetiredSampleNoteId(id: string): boolean {
  return RETIRED_SAMPLE_NOTE_IDS.has(id);
}

export function filterRetiredSampleNotes(notes: Note[]): Note[] {
  return notes.filter((note) => !isRetiredSampleNoteId(note.id));
}
""")

# Storage: stop seeding the welcome note and migrate it away on existing devices.
p = Path('src/services/storage.ts')
s = p.read_text()
s = s.replace(
    "import { generateSyncCode } from './cloudVault';",
    "import { generateSyncCode, recordNoteDeletion } from './cloudVault';\nimport { filterRetiredSampleNotes, isRetiredSampleNoteId } from './retiredSamples';",
)

if "id: 'sample-welcome'" in s:
    start = s.index("  {\n    id: 'sample-welcome',")
    end = s.index("  {\n    id: 'sample-shopping',", start)
    s = s[:start] + s[end:]

helper = """function migrateRetiredSampleNotes(notes: Note[]): Note[] {
  const retired = notes.filter((note) => isRetiredSampleNoteId(note.id));
  if (retired.length === 0) return notes;

  for (const note of retired) recordNoteDeletion(note);
  return filterRetiredSampleNotes(notes);
}

"""
if 'function migrateRetiredSampleNotes' not in s:
    s = s.replace(
        '// Initial sample notes showcasing features\n',
        '// Initial sample notes showcasing features\n' + helper,
        1,
    )

old = """        const strictResult = parseNotesArray(rawResult);
        const result = strictResult ?? salvageNotesArray(rawResult);

        if (strictResult === null && Array.isArray(rawResult) && rawResult.length > result.length) {
"""
new = """        const strictResult = parseNotesArray(rawResult);
        const parsedResult = strictResult ?? salvageNotesArray(rawResult);
        const result = migrateRetiredSampleNotes(parsedResult);

        if (result.length !== parsedResult.length) {
          void saveAllNotes(result).catch((err) => console.warn('Failed to persist retired sample migration', err));
        }

        if (strictResult === null && Array.isArray(rawResult) && rawResult.length > parsedResult.length) {
"""
if old not in s:
    raise SystemExit('IndexedDB parsing marker not found')
s = s.replace(old, new, 1)

old = """    const parsed: unknown = JSON.parse(data);
    const strict = parseNotesArray(parsed);
    if (strict) return strict;

    const salvaged = salvageNotesArray(parsed);
    if (salvaged.length > 0) {
      localStorage.setItem('ios_notes_data', JSON.stringify(salvaged));
      return salvaged;
    }
"""
new = """    const parsed: unknown = JSON.parse(data);
    const strict = parseNotesArray(parsed);
    if (strict) {
      const migrated = migrateRetiredSampleNotes(strict);
      if (migrated.length !== strict.length) {
        localStorage.setItem('ios_notes_data', JSON.stringify(migrated));
      }
      return sortNotesForDisplay(migrated);
    }

    const salvaged = salvageNotesArray(parsed);
    if (salvaged.length > 0) {
      const migrated = migrateRetiredSampleNotes(salvaged);
      localStorage.setItem('ios_notes_data', JSON.stringify(migrated));
      return sortNotesForDisplay(migrated);
    }
"""
if old not in s:
    raise SystemExit('localStorage parsing marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Cloud sync: a stale encrypted/plaintext welcome sample may never resurrect in the UI.
p = Path('src/services/cloudflareSync.ts')
s = p.read_text()
s = s.replace(
    "  loadTombstones,\n  mergeRemoteTombstones,",
    "  loadTombstones,\n  mergeRemoteTombstones,\n  saveTombstones,",
)
s = s.replace(
    "} from './cloudVault';",
    "} from './cloudVault';\nimport { filterRetiredSampleNotes, isRetiredSampleNoteId } from './retiredSamples';",
)

old = """  for (const note of [...remoteNotes, ...localNotes]) {
    const existing = byId.get(note.id);
"""
new = """  for (const note of [...remoteNotes, ...localNotes]) {
    if (isRetiredSampleNoteId(note.id)) continue;
    const existing = byId.get(note.id);
"""
if old not in s:
    raise SystemExit('merge notes marker not found')
s = s.replace(old, new, 1)

old = """        const parsed = parseNotesArray([payload]);
        if (!parsed || parsed.length !== 1) {
          return { success: false, error: 'クラウドのメモデータが破損しています。' };
        }
        remoteNotes.push(parsed[0]);
"""
new = """        const parsed = parseNotesArray([payload]);
        if (!parsed || parsed.length !== 1) {
          return { success: false, error: 'クラウドのメモデータが破損しています。' };
        }
        const remoteNote = parsed[0];
        if (isRetiredSampleNoteId(remoteNote.id)) {
          saveTombstones([
            ...loadTombstones(),
            { id: remoteNote.id, deletedAt: Date.now(), version: Math.max(entry.version, remoteNote.version || 1) + 1 },
          ]);
          continue;
        }
        remoteNotes.push(remoteNote);
"""
if old not in s:
    raise SystemExit('encrypted remote note marker not found')
s = s.replace(old, new, 1)

old = """      return { success: true, remoteNotes: parsedRemoteNotes, remoteTombstones: [] };
"""
new = """      for (const remoteNote of parsedRemoteNotes) {
        if (isRetiredSampleNoteId(remoteNote.id)) {
          saveTombstones([
            ...loadTombstones(),
            { id: remoteNote.id, deletedAt: Date.now(), version: (remoteNote.version || 1) + 1 },
          ]);
        }
      }
      return {
        success: true,
        remoteNotes: filterRetiredSampleNotes(parsedRemoteNotes),
        remoteTombstones: [],
      };
"""
if old not in s:
    raise SystemExit('legacy remote response marker not found')
s = s.replace(old, new, 1)
p.write_text(s)
