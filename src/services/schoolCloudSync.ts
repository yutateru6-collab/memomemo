import { CloudflareSyncConfig } from '../types';
import {
  SchoolClassSettings,
  SchoolLesson,
  SchoolLessonTombstone,
} from '../schoolTypes';
import {
  decryptEntry,
  deriveVaultToken,
  encryptCloudPayload,
  EncryptedCloudEntry,
  isValidSyncCode,
} from './cloudVault';
import {
  getSchoolClassSettings,
  getSchoolLessons,
  loadSchoolLessonTombstones,
  mergeSchoolLessonTombstones,
  normalizeSchoolClassSettings,
  normalizeSchoolLesson,
  saveAllSchoolClassSettings,
  saveAllSchoolLessons,
} from './schoolStorage';

const LESSON_PREFIX = 'school:lesson:';
const SETTINGS_PREFIX = 'school:settings:';
const LESSON_ENTITY = 'school-lesson-v1';
const SETTINGS_ENTITY = 'school-settings-v1';

interface LessonEnvelope {
  __memomemoEntity: typeof LESSON_ENTITY;
  lesson: SchoolLesson;
}

interface SettingsEnvelope {
  __memomemoEntity: typeof SETTINGS_ENTITY;
  settings: SchoolClassSettings;
}

export interface SchoolCloudSyncResult {
  success: boolean;
  lessons?: SchoolLesson[];
  settings?: SchoolClassSettings[];
  error?: string;
}

function isEncryptedEntry(value: unknown): value is EncryptedCloudEntry {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === 'string' &&
    typeof item.version === 'number' && Number.isInteger(item.version) && item.version >= 1 &&
    typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) &&
    typeof item.deleted === 'boolean' &&
    typeof item.iv === 'string' &&
    typeof item.ciphertext === 'string'
  );
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

function lessonCloudId(id: string): string {
  return `${LESSON_PREFIX}${id}`;
}

function settingsCloudId(classId: string): string {
  return `${SETTINGS_PREFIX}${classId}`;
}

function parseRemoteTombstone(payload: unknown, entryVersion: number): SchoolLessonTombstone | null {
  if (!payload || typeof payload !== 'object') return null;
  const item = payload as Record<string, unknown>;
  if (
    typeof item.id !== 'string' || !item.id.startsWith(LESSON_PREFIX) ||
    typeof item.deletedAt !== 'number' || !Number.isFinite(item.deletedAt)
  ) return null;
  return {
    lessonId: item.id.slice(LESSON_PREFIX.length),
    deletedAt: item.deletedAt,
    version: typeof item.version === 'number' && Number.isInteger(item.version) && item.version >= 1
      ? Math.max(item.version, entryVersion)
      : entryVersion,
  };
}

function mergeLessons(
  local: SchoolLesson[],
  remote: SchoolLesson[],
  tombstones: SchoolLessonTombstone[]
): SchoolLesson[] {
  const byId = new Map<string, SchoolLesson>();
  for (const lesson of [...remote, ...local]) {
    const current = byId.get(lesson.id);
    const lessonVersion = lesson.version || 1;
    const currentVersion = current?.version || 1;
    if (
      !current ||
      lessonVersion > currentVersion ||
      (lessonVersion === currentVersion && lesson.updatedAt >= current.updatedAt)
    ) {
      byId.set(lesson.id, lesson);
    }
  }

  for (const tombstone of tombstones) {
    const lesson = byId.get(tombstone.lessonId);
    if (!lesson) continue;
    const lessonVersion = lesson.version || 1;
    if (
      tombstone.version > lessonVersion ||
      (tombstone.version === lessonVersion && tombstone.deletedAt >= lesson.updatedAt)
    ) {
      byId.delete(tombstone.lessonId);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => b.lessonDate.localeCompare(a.lessonDate) || b.updatedAt - a.updatedAt
  );
}

function mergeSettings(local: SchoolClassSettings[], remote: SchoolClassSettings[]): SchoolClassSettings[] {
  const byClass = new Map<string, SchoolClassSettings>();
  for (const settings of [...remote, ...local]) {
    const current = byClass.get(settings.classId);
    const settingsVersion = settings.version || 1;
    const currentVersion = current?.version || 1;
    if (
      !current ||
      settingsVersion > currentVersion ||
      (settingsVersion === currentVersion && settings.updatedAt >= current.updatedAt)
    ) {
      byClass.set(settings.classId, settings);
    }
  }
  return Array.from(byClass.values());
}

export function isSchoolCloudPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const marker = (value as Record<string, unknown>).__memomemoEntity;
  return marker === LESSON_ENTITY || marker === SETTINGS_ENTITY;
}

export function isSchoolCloudTombstonePayload(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.startsWith(LESSON_PREFIX);
}

export async function syncSchoolWithCloudflare(
  config: CloudflareSyncConfig
): Promise<SchoolCloudSyncResult> {
  const workerUrl = resolveWorkerUrl(config.workerUrl);
  if (!workerUrl) return { success: false, error: 'Cloudflare同期URLの形式が正しくありません。' };
  if (!isValidSyncCode(config.syncCode)) return { success: false, error: '同期コードが設定されていません。' };
  if (!navigator.onLine) return { success: false, error: '現在オフラインです。' };

  try {
    const [localLessons, localSettings] = await Promise.all([
      getSchoolLessons(),
      getSchoolClassSettings(),
    ]);
    const localTombstones = loadSchoolLessonTombstones();

    const lessonEntries = await Promise.all(
      localLessons.map((lesson) => {
        const envelope: LessonEnvelope = { __memomemoEntity: LESSON_ENTITY, lesson };
        return encryptCloudPayload(
          config.syncCode,
          lessonCloudId(lesson.id),
          envelope,
          lesson.version || 1,
          lesson.updatedAt,
          false
        );
      })
    );
    const settingsEntries = await Promise.all(
      localSettings.map((settings) => {
        const envelope: SettingsEnvelope = { __memomemoEntity: SETTINGS_ENTITY, settings };
        return encryptCloudPayload(
          config.syncCode,
          settingsCloudId(settings.classId),
          envelope,
          settings.version || 1,
          settings.updatedAt,
          false
        );
      })
    );
    const tombstoneEntries = await Promise.all(
      localTombstones.map((tombstone) => {
        const id = lessonCloudId(tombstone.lessonId);
        return encryptCloudPayload(
          config.syncCode,
          id,
          { id, deletedAt: tombstone.deletedAt, version: tombstone.version },
          tombstone.version,
          tombstone.deletedAt,
          true
        );
      })
    );

    const vaultToken = await deriveVaultToken(config.syncCode);
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync-v2',
        vaultToken,
        entries: [...lessonEntries, ...settingsEntries, ...tombstoneEntries],
        clientTimestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `学校メモのクラウド同期エラー (${response.status}): ${text || response.statusText}` };
    }

    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return { success: false, error: '学校メモ同期先から予期しない応答が返されました。' };
    }

    if (!('entries' in data)) {
      if ((data as { success?: unknown }).success === true) {
        return { success: true, lessons: localLessons, settings: localSettings };
      }
      return { success: false, error: '学校メモ同期先から予期しない応答が返されました。' };
    }

    const rawEntries = (data as { entries?: unknown }).entries;
    if (!Array.isArray(rawEntries) || !rawEntries.every(isEncryptedEntry)) {
      return { success: false, error: '学校メモ同期先から不正な暗号化データが返されました。' };
    }

    const remoteLessons: SchoolLesson[] = [];
    const remoteSettings: SchoolClassSettings[] = [];
    const remoteTombstones: SchoolLessonTombstone[] = [];

    for (const entry of rawEntries) {
      let payload: unknown;
      try {
        payload = await decryptEntry(entry, config.syncCode);
      } catch {
        return { success: false, error: '学校メモのクラウドデータを復号できませんでした。同期コードを確認してください。' };
      }

      if (entry.deleted) {
        const tombstone = parseRemoteTombstone(payload, entry.version);
        if (tombstone) remoteTombstones.push(tombstone);
        continue;
      }

      if (!payload || typeof payload !== 'object') continue;
      const record = payload as Record<string, unknown>;
      if (record.__memomemoEntity === LESSON_ENTITY) {
        const lesson = normalizeSchoolLesson(record.lesson);
        if (!lesson) return { success: false, error: 'クラウドの授業メモデータが破損しています。' };
        remoteLessons.push({ ...lesson, version: Math.max(lesson.version || 1, entry.version) });
      } else if (record.__memomemoEntity === SETTINGS_ENTITY) {
        const settings = normalizeSchoolClassSettings(record.settings);
        if (!settings) return { success: false, error: 'クラウドの試験範囲データが破損しています。' };
        remoteSettings.push({ ...settings, version: Math.max(settings.version || 1, entry.version) });
      }
      // Normal encrypted notes and future unrelated entity types are intentionally ignored here.
    }

    const allTombstones = mergeSchoolLessonTombstones(remoteTombstones);
    const mergedLessons = mergeLessons(localLessons, remoteLessons, allTombstones);
    const mergedSettings = mergeSettings(localSettings, remoteSettings);
    await Promise.all([
      saveAllSchoolLessons(mergedLessons),
      saveAllSchoolClassSettings(mergedSettings),
    ]);

    return { success: true, lessons: mergedLessons, settings: mergedSettings };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '学校メモのクラウド同期中にエラーが発生しました。',
    };
  }
}
