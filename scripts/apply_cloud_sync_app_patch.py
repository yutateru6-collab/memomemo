from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'patch target not found: {label}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# storage.ts: auto-provision a per-device 256-bit sync code and same-origin endpoint.
replace_once(
    'src/services/storage.ts',
    "import { parseNotesArray, salvageNotesArray, sortNotesForDisplay } from './noteValidation';\n",
    "import { parseNotesArray, salvageNotesArray, sortNotesForDisplay } from './noteValidation';\nimport { generateSyncCode } from './cloudVault';\n",
    'storage cloudVault import',
)

replace_once(
    'src/services/storage.ts',
    """export const DEFAULT_CF_CONFIG: CloudflareSyncConfig = {\n  workerUrl: '',\n  apiToken: '',\n  kvNamespace: 'NOTES_KV',\n  autoSync: false,\n  lastSyncTime: null,\n  status: 'idle',\n  errorMessage: null,\n};\n\nexport function getCloudflareConfig(): CloudflareSyncConfig {\n  try {\n    const saved = localStorage.getItem(CLOUDFLARE_CONFIG_KEY);\n    if (saved) {\n      return { ...DEFAULT_CF_CONFIG, ...JSON.parse(saved) };\n    }\n  } catch {\n    // ignore\n  }\n  return DEFAULT_CF_CONFIG;\n}\n""",
    """export const DEFAULT_CF_CONFIG: CloudflareSyncConfig = {\n  workerUrl: '/api/sync',\n  apiToken: '',\n  kvNamespace: 'MEMOMEMO_KV',\n  syncCode: '',\n  autoSync: true,\n  lastSyncTime: null,\n  status: 'idle',\n  errorMessage: null,\n};\n\nexport function getCloudflareConfig(): CloudflareSyncConfig {\n  let config: CloudflareSyncConfig = { ...DEFAULT_CF_CONFIG };\n  try {\n    const saved = localStorage.getItem(CLOUDFLARE_CONFIG_KEY);\n    if (saved) {\n      config = { ...DEFAULT_CF_CONFIG, ...JSON.parse(saved) };\n    }\n  } catch {\n    // Keep safe defaults if old config JSON is malformed.\n  }\n\n  let changed = false;\n  if (!config.workerUrl?.trim()) {\n    config.workerUrl = '/api/sync';\n    changed = true;\n  }\n  if (!config.syncCode) {\n    config.syncCode = generateSyncCode();\n    config.autoSync = true;\n    config.status = 'idle';\n    config.errorMessage = null;\n    changed = true;\n  }\n  if (changed) saveCloudflareConfig(config);\n  return config;\n}\n""",
    'storage cloud config migration',
)

# App.tsx: use encrypted cloud merge semantics and deletion tombstones.
replace_once(
    'src/App.tsx',
    "import { syncWithCloudflare } from './services/cloudflareSync';\nimport { mergeNotesByFreshness } from './services/noteValidation';\n",
    "import { mergeNotesWithCloudState, syncWithCloudflare } from './services/cloudflareSync';\nimport { recordNoteDeletion } from './services/cloudVault';\n",
    'App sync imports',
)

replace_once(
    'src/App.tsx',
    "const mergedNotes = mergeNotesByFreshness(notesRef.current, result.remoteNotes);",
    "const mergedNotes = mergeNotesWithCloudState(\n          notesRef.current,\n          result.remoteNotes,\n          result.remoteTombstones || []\n        );",
    'App cloud merge',
)

replace_once(
    'src/App.tsx',
    "if (!currentConfig.autoSync || !currentConfig.workerUrl.trim()) return;",
    "if (!currentConfig.autoSync || !currentConfig.syncCode || !currentConfig.workerUrl.trim()) return;",
    'App auto sync guard',
)

replace_once(
    'src/App.tsx',
    """  // Delete Note\n  const handleDeleteNote = async (noteId: string) => {\n    try {\n      await deleteNoteStorage(noteId);\n    } catch (err) {\n      reportStorageError('メモ削除', err);\n      return;\n    }\n\n    const nextNotes = notesRef.current.filter((n) => n.id !== noteId);\n""",
    """  // Delete Note. Record a versioned tombstone only after local deletion succeeds.\n  const handleDeleteNote = async (noteId: string) => {\n    const noteToDelete = notesRef.current.find((note) => note.id === noteId);\n    try {\n      await deleteNoteStorage(noteId);\n    } catch (err) {\n      reportStorageError('メモ削除', err);\n      return;\n    }\n\n    if (noteToDelete) recordNoteDeletion(noteToDelete);\n    const nextNotes = notesRef.current.filter((n) => n.id !== noteId);\n""",
    'App delete tombstone',
)

replace_once(
    'src/App.tsx',
    """  useEffect(() => {\n    return () => {\n      if (autoSyncTimer.current) window.clearTimeout(autoSyncTimer.current);\n    };\n  }, []);\n\n  // Handle Note Save/Update. Keep this outside a React state-updater function so\n""",
    """  useEffect(() => {\n    return () => {\n      if (autoSyncTimer.current) window.clearTimeout(autoSyncTimer.current);\n    };\n  }, []);\n\n  // On the deployed HTTPS app, pull cloud state once after local IndexedDB loads.\n  // Localhost/dev is intentionally excluded so QA and offline development remain deterministic.\n  useEffect(() => {\n    if (!isLoaded || typeof window === 'undefined') return;\n    const currentConfig = cfConfigRef.current;\n    if (!currentConfig.autoSync || !currentConfig.syncCode) return;\n    const hostname = window.location.hostname;\n    if (window.location.protocol !== 'https:' || hostname === 'localhost' || hostname === '127.0.0.1') return;\n    const timer = window.setTimeout(() => {\n      void triggerCloudflareSync();\n    }, 900);\n    return () => window.clearTimeout(timer);\n  }, [isLoaded, triggerCloudflareSync]);\n\n  // Handle Note Save/Update. Keep this outside a React state-updater function so\n""",
    'App initial production sync',
)

# Regression QA: encrypted payload must contain latest revision metadata and must never leak plaintext.
replace_once(
    '.github/workflows/fix-and-qa.yml',
    """            const sentFinal = capturedBodies.some(body => Array.isArray(body?.notes) && body.notes.some(n => n?.title === 'FINAL AUTOSYNC TITLE'));\n            const currentTitle = await page.locator('#note-title-input').inputValue();\n            if (!sentFinal) findings.push({ severity: 'critical', probe: 'auto-sync-latest-payload', detail: 'The latest title was not present in the debounced sync payload.' });\n""",
    """            const sentFinal = capturedBodies.some(body =>\n              typeof body?.vaultToken === 'string' &&\n              Array.isArray(body?.entries) &&\n              body.entries.some(entry => Number(entry?.version) >= 2) &&\n              !JSON.stringify(body).includes('FINAL AUTOSYNC TITLE')\n            );\n            const currentTitle = await page.locator('#note-title-input').inputValue();\n            if (!sentFinal) findings.push({ severity: 'critical', probe: 'auto-sync-encrypted-latest-payload', detail: 'Auto-sync did not send an encrypted latest-version entry, or leaked plaintext.' });\n""",
    'QA encrypted auto-sync assertion',
)

# Ensure Worker source itself is syntax checked in CI.
replace_once(
    '.github/workflows/fix-and-qa.yml',
    """      - name: Production build\n        run: bun run build\n\n      - name: Install Chromium QA dependency\n""",
    """      - name: Production build\n        run: bun run build\n\n      - name: Worker syntax check\n        run: node --check worker/index.js\n\n      - name: Install Chromium QA dependency\n""",
    'QA worker syntax check',
)

print('Encrypted cloud sync integration patches applied.')
