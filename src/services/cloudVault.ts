import { Note } from '../types';

export interface SyncTombstone {
  id: string;
  deletedAt: number;
  version: number;
}

export interface EncryptedCloudEntry {
  key: string;
  version: number;
  updatedAt: number;
  deleted: boolean;
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOMBSTONES_KEY = 'memomemo_cloud_tombstones_v1';
const MAX_NOTE_PLAINTEXT_BYTES = 16 * 1024 * 1024;

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

function decodeSyncCode(syncCode: string): Uint8Array {
  const trimmed = syncCode.trim();
  const bytes = fromBase64Url(trimmed);
  if (bytes.length !== 32) throw new Error('同期コードの形式が正しくありません。');
  return bytes;
}

async function deriveEncryptionKey(secret: Uint8Array): Promise<CryptoKey> {
  const material = await sha256(concatBytes(encoder.encode('memomemo-encryption-v1:'), secret));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

export function isValidSyncCode(syncCode: string): boolean {
  try {
    return decodeSyncCode(syncCode).length === 32;
  } catch {
    return false;
  }
}

export async function deriveVaultToken(syncCode: string): Promise<string> {
  const secret = decodeSyncCode(syncCode);
  const digest = await sha256(concatBytes(encoder.encode('memomemo-auth-v1:'), secret));
  return toBase64Url(digest);
}

async function deriveEntryKey(secret: Uint8Array, noteId: string): Promise<string> {
  const digest = await sha256(
    concatBytes(encoder.encode('memomemo-entry-v1:'), secret, encoder.encode(':' + noteId))
  );
  return toBase64Url(digest);
}

async function encryptPayload(
  syncCode: string,
  noteId: string,
  payload: unknown,
  version: number,
  updatedAt: number,
  deleted: boolean
): Promise<EncryptedCloudEntry> {
  const secret = decodeSyncCode(syncCode);
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_NOTE_PLAINTEXT_BYTES) {
    throw new Error(
      'このメモは添付ファイルを含めた容量が大きすぎるためクラウド同期できません。端末には保存されています。大きな添付は約12MB以下を目安にしてください。'
    );
  }

  const key = await deriveEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  return {
    key: await deriveEntryKey(secret, noteId),
    version,
    updatedAt,
    deleted,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
  };
}

export async function encryptNote(note: Note, syncCode: string): Promise<EncryptedCloudEntry> {
  return encryptPayload(syncCode, note.id, note, note.version, note.updatedAt, false);
}

export async function encryptTombstone(
  tombstone: SyncTombstone,
  syncCode: string
): Promise<EncryptedCloudEntry> {
  return encryptPayload(
    syncCode,
    tombstone.id,
    { ...tombstone, deleted: true },
    tombstone.version,
    tombstone.deletedAt,
    true
  );
}

export async function decryptEntry(entry: EncryptedCloudEntry, syncCode: string): Promise<unknown> {
  const secret = decodeSyncCode(syncCode);
  const key = await deriveEncryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(entry.iv) },
    key,
    fromBase64Url(entry.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
}

export function loadTombstones(): SyncTombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is SyncTombstone => {
      if (!value || typeof value !== 'object') return false;
      const item = value as Record<string, unknown>;
      return (
        typeof item.id === 'string' &&
        typeof item.deletedAt === 'number' &&
        Number.isFinite(item.deletedAt) &&
        typeof item.version === 'number' &&
        Number.isFinite(item.version)
      );
    });
  } catch {
    return [];
  }
}

export function saveTombstones(tombstones: SyncTombstone[]): void {
  try {
    const newest = new Map<string, SyncTombstone>();
    for (const tombstone of tombstones) {
      const current = newest.get(tombstone.id);
      if (
        !current ||
        tombstone.version > current.version ||
        (tombstone.version === current.version && tombstone.deletedAt > current.deletedAt)
      ) {
        newest.set(tombstone.id, tombstone);
      }
    }
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(Array.from(newest.values())));
  } catch (err) {
    console.warn('Failed to save cloud tombstones', err);
  }
}

export function recordNoteDeletion(note: Note): SyncTombstone {
  const tombstone: SyncTombstone = {
    id: note.id,
    deletedAt: Date.now(),
    version: Math.max(1, (note.version || 1) + 1),
  };
  saveTombstones([...loadTombstones(), tombstone]);
  return tombstone;
}

export function mergeRemoteTombstones(remote: SyncTombstone[]): SyncTombstone[] {
  const combined = [...loadTombstones(), ...remote];
  saveTombstones(combined);
  return loadTombstones();
}
