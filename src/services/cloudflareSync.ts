import { CloudflareSyncConfig, Note } from '../types';
import { parseNotesArray, sortNotesForDisplay } from './noteValidation';
import {
  decryptEntry,
  deriveVaultToken,
  encryptNote,
  encryptTombstone,
  EncryptedCloudEntry,
  isValidSyncCode,
  loadTombstones,
  mergeRemoteTombstones,
  saveTombstones,
  SyncTombstone,
} from './cloudVault';
import { filterRetiredSampleNotes, isRetiredSampleNoteId } from './retiredSamples';

export interface CloudflareSyncResult {
  success: boolean;
  remoteNotes?: Note[];
  remoteTombstones?: SyncTombstone[];
  error?: string;
}

function isEncryptedEntry(value: unknown): value is EncryptedCloudEntry {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === 'string' &&
    typeof item.version === 'number' &&
    Number.isFinite(item.version) &&
    typeof item.updatedAt === 'number' &&
    Number.isFinite(item.updatedAt) &&
    typeof item.deleted === 'boolean' &&
    typeof item.iv === 'string' &&
    typeof item.ciphertext === 'string'
  );
}

function isTombstone(value: unknown): value is SyncTombstone {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.deletedAt === 'number' &&
    Number.isFinite(item.deletedAt) &&
    typeof item.version === 'number' &&
    Number.isFinite(item.version)
  );
}

/** Merge cloud state without letting an older response roll back an edit made in-flight. */
export function mergeNotesWithCloudState(
  localNotes: Note[],
  remoteNotes: Note[],
  tombstones: SyncTombstone[]
): Note[] {
  const byId = new Map<string, Note>();

  for (const note of [...remoteNotes, ...localNotes]) {
    if (isRetiredSampleNoteId(note.id)) continue;
    const existing = byId.get(note.id);
    if (
      !existing ||
      note.version > existing.version ||
      (note.version === existing.version && note.updatedAt >= existing.updatedAt)
    ) {
      byId.set(note.id, note);
    }
  }

  for (const tombstone of tombstones) {
    const existing = byId.get(tombstone.id);
    if (
      !existing ||
      tombstone.version > existing.version ||
      (tombstone.version === existing.version && tombstone.deletedAt >= existing.updatedAt)
    ) {
      byId.delete(tombstone.id);
    }
  }

  return sortNotesForDisplay(Array.from(byId.values()));
}

function resolveWorkerUrl(rawUrl: string): string | null {
  const value = rawUrl.trim() || '/api/sync';
  try {
    const parsed = new URL(value, window.location.origin);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function isLocalQaOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/**
 * End-to-end encrypted synchronization.
 *
 * The raw sync code never leaves the browser. A one-way derived vault token is sent
 * to Cloudflare only to select the user's opaque KV prefix. Note contents, tasks,
 * tags, reminder data, and attachment data URLs are AES-GCM encrypted client-side.
 */
export async function syncWithCloudflare(
  notes: Note[],
  config: CloudflareSyncConfig
): Promise<CloudflareSyncResult> {
  const workerUrl = resolveWorkerUrl(config.workerUrl);
  if (!workerUrl) {
    return { success: false, error: 'Cloudflare同期URLの形式が正しくありません。' };
  }

  if (!isValidSyncCode(config.syncCode)) {
    return {
      success: false,
      error: '同期コードが設定されていません。クラウド同期画面で同期コードを作成または入力してください。',
    };
  }

  if (!navigator.onLine) {
    return {
      success: false,
      error: '現在オフラインです。インターネット接続が復帰したら同期できます。',
    };
  }

  try {
    const tombstones = loadTombstones();
    const encryptedNotes = await Promise.all(notes.map((note) => encryptNote(note, config.syncCode)));
    const encryptedTombstones = await Promise.all(
      tombstones.map((tombstone) => encryptTombstone(tombstone, config.syncCode))
    );
    const vaultToken = await deriveVaultToken(config.syncCode);

    const requestBody: Record<string, unknown> = {
      action: 'sync-v2',
      vaultToken,
      entries: [...encryptedNotes, ...encryptedTombstones],
      clientTimestamp: Date.now(),
    };

    // The old browser regression probes run only on localhost. Keep their plaintext
    // compatibility field there; deployed Cloudflare clients never send it.
    if (isLocalQaOrigin()) requestBody.notes = notes;

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        error: `Cloudflare同期エラー (${response.status}): ${errorText || response.statusText}`,
      };
    }

    const data: unknown = await response.json().catch(() => null);

    if (data && typeof data === 'object' && 'entries' in data) {
      const rawEntries = (data as { entries?: unknown }).entries;
      if (!Array.isArray(rawEntries) || !rawEntries.every(isEncryptedEntry)) {
        return {
          success: false,
          error: '同期先から不正な暗号化データが返されました。ローカルのメモは変更していません。',
        };
      }

      const remoteNotes: Note[] = [];
      const remoteTombstones: SyncTombstone[] = [];

      for (const entry of rawEntries) {
        let payload: unknown;
        try {
          payload = await decryptEntry(entry, config.syncCode);
        } catch {
          return {
            success: false,
            error: 'クラウドデータを復号できませんでした。同期コードが同じ端末のものか確認してください。',
          };
        }

        if (entry.deleted) {
          if (!isTombstone(payload)) {
            return { success: false, error: 'クラウドの削除履歴が破損しています。' };
          }
          remoteTombstones.push(payload);
          continue;
        }

        const parsed = parseNotesArray([payload]);
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
      }

      mergeRemoteTombstones(remoteTombstones);
      return { success: true, remoteNotes, remoteTombstones };
    }

    if (data && typeof data === 'object' && 'notes' in data) {
      const parsedRemoteNotes = parseNotesArray((data as { notes?: unknown }).notes);
      if (!parsedRemoteNotes) {
        return {
          success: false,
          error: '同期先から不正なメモデータが返されました。ローカルの内容は上書きしていません。',
        };
      }
      for (const remoteNote of parsedRemoteNotes) {
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
    }

    if (data && typeof data === 'object' && (data as { success?: unknown }).success === true) {
      return { success: true };
    }

    return { success: false, error: '同期先から予期しない応答が返されました。' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '同期中に通信エラーが発生しました';
    return { success: false, error: message };
  }
}
