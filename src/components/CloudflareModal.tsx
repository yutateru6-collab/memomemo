import React, { useState } from 'react';
import { CloudflareSyncConfig, Note } from '../types';
import { SAMPLE_WORKER_CODE } from '../services/cloudflareSync';
import { parseNotesArray } from '../services/noteValidation';
import { X, Cloud, RefreshCw, Check, Copy, AlertCircle, Download, Upload, Server } from 'lucide-react';

interface CloudflareModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CloudflareSyncConfig;
  onSaveConfig: (config: CloudflareSyncConfig) => void;
  onTriggerSync: (configOverride?: CloudflareSyncConfig) => Promise<void>;
  notes: Note[];
  onImportNotes: (notes: Note[]) => void;
}

export const CloudflareModal: React.FC<CloudflareModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTriggerSync,
  notes,
  onImportNotes
}) => {
  const [formData, setFormData] = useState<CloudflareSyncConfig>(config);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCode, setShowCode] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(formData);
  };

  const handleManualSync = async () => {
    onSaveConfig(formData);
    setIsSyncing(true);
    try {
      await onTriggerSync(formData);
    } finally {
      setIsSyncing(false);
    }
  };

  const copyWorkerCode = () => {
    navigator.clipboard.writeText(SAMPLE_WORKER_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Export local notes JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ios_notes_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import local notes JSON. Validate every nested field before touching state/storage.
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(String(event.target?.result ?? ''));
        const validatedNotes = parseNotesArray(parsed);
        if (!validatedNotes) {
          alert('このJSONはMEMOMEMOの正しいバックアップ形式ではありません。現在のメモは変更していません。');
          return;
        }

        onImportNotes(validatedNotes);
        alert(`${validatedNotes.length} 件のメモをインポートしました。`);
      } catch {
        alert('JSONファイルを読み込めませんでした。現在のメモは変更していません。');
      } finally {
        input.value = '';
      }
    };
    reader.onerror = () => {
      alert('ファイルの読み込みに失敗しました。現在のメモは変更していません。');
      input.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div
      id="cloudflare-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="cloudflare-modal-content"
        className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Cloudflare 同期設定</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Workers KV を使って複数端末間でメモを同期
              </p>
            </div>
          </div>
          <button
            id="close-cloudflare-modal-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status Badge Card */}
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">同期ステータス:</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                {config.status === 'syncing' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                    <span className="text-amber-500">同期中...</span>
                  </>
                ) : config.status === 'success' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">同期完了</span>
                  </>
                ) : config.status === 'error' ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-rose-500">同期エラー</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-neutral-400" />
                    <span className="text-neutral-500">未同期</span>
                  </>
                )}
              </span>
            </div>
            {config.lastSyncTime && (
              <div className="mt-1 text-[11px] text-neutral-400">
                最終同期: {new Date(config.lastSyncTime).toLocaleString('ja-JP')}
              </div>
            )}
            {config.errorMessage && (
              <div className="mt-2 text-xs text-rose-500 bg-rose-500/10 p-2 rounded-lg break-all">
                {config.errorMessage}
              </div>
            )}
          </div>

          {/* Form Settings */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Cloudflare Worker URL
              </label>
              <input
                id="cf-worker-url-input"
                type="url"
                placeholder="https://notes-sync.your-subdomain.workers.dev"
                value={formData.workerUrl}
                onChange={(e) => setFormData({ ...formData, workerUrl: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                API トークン（推奨 / Worker側で認証設定時）
              </label>
              <input
                id="cf-api-token-input"
                type="password"
                placeholder="Bearer トークンを入力"
                value={formData.apiToken}
                onChange={(e) => setFormData({ ...formData, apiToken: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                KV ネームスペース名
              </label>
              <input
                id="cf-kv-namespace-input"
                type="text"
                placeholder="NOTES_KV"
                value={formData.kvNamespace}
                onChange={(e) => setFormData({ ...formData, kvNamespace: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-xs font-medium">変更時の自動同期</span>
                <p className="text-[11px] text-neutral-500">メモ保存時にバックグラウンドで同期します</p>
              </div>
              <input
                id="cf-auto-sync-toggle"
                type="checkbox"
                checked={formData.autoSync}
                onChange={(e) => setFormData({ ...formData, autoSync: e.target.checked })}
                className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 accent-amber-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              id="cf-save-btn"
              type="button"
              onClick={handleSave}
              className="flex-1 py-2 px-3 text-xs font-medium rounded-xl bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
            >
              設定を保存
            </button>
            <button
              id="cf-sync-now-btn"
              type="button"
              disabled={isSyncing}
              onClick={handleManualSync}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              今すぐ同期
            </button>
          </div>

          {/* Worker Code Accordion */}
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <button
              type="button"
              onClick={() => setShowCode(!showCode)}
              className="w-full flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 hover:text-amber-500 font-medium"
            >
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                Cloudflare Worker のコードを見る（1クリック作成）
              </span>
              <span>{showCode ? '閉じる' : '展開'}</span>
            </button>

            {showCode && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500">worker.js にコピー＆ペーストしてデプロイ</span>
                  <button
                    type="button"
                    onClick={copyWorkerCode}
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors text-amber-600 dark:text-amber-400"
                  >
                    {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? 'コピー済み' : 'コードをコピー'}
                  </button>
                </div>
                <pre className="p-3 bg-neutral-900 text-neutral-200 rounded-xl text-[10px] font-mono overflow-x-auto max-h-44 border border-neutral-800">
                  {SAMPLE_WORKER_CODE}
                </pre>
              </div>
            )}
          </div>

          {/* Offline JSON Backup / Restore */}
          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
              オフライン手動バックアップ / 復元
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-neutral-500" />
                JSONバックアップ保存
              </button>
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-neutral-500" />
                JSONから復元
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
