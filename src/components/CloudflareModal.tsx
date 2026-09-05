import React, { useEffect, useState } from 'react';
import { CloudflareSyncConfig, Note } from '../types';
import { generateSyncCode, isValidSyncCode } from '../services/cloudVault';
import { parseNotesArray } from '../services/noteValidation';
import {
  AlertCircle,
  Check,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

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
  onImportNotes,
}) => {
  const [formData, setFormData] = useState<CloudflareSyncConfig>(config);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showSyncCode, setShowSyncCode] = useState(false);

  useEffect(() => {
    if (isOpen) setFormData(config);
  }, [isOpen, config]);

  if (!isOpen) return null;

  const syncCodeIsValid = isValidSyncCode(formData.syncCode);

  const handleGenerateCode = () => {
    if (formData.syncCode && !confirm('新しい同期コードに切り替えると、以前のクラウド保管庫とは別になります。新しいコードを作りますか？')) {
      return;
    }
    setFormData((prev) => ({
      ...prev,
      workerUrl: prev.workerUrl.trim() || '/api/sync',
      syncCode: generateSyncCode(),
      autoSync: true,
      status: 'idle',
      errorMessage: null,
    }));
    setShowSyncCode(true);
  };

  const handleCopyCode = async () => {
    if (!formData.syncCode) return;
    await navigator.clipboard.writeText(formData.syncCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSave = () => {
    if (!syncCodeIsValid) {
      alert('同期コードが正しくありません。新しい同期コードを作成するか、別端末のコードを貼り付けてください。');
      return;
    }
    onSaveConfig({ ...formData, workerUrl: formData.workerUrl.trim() || '/api/sync' });
  };

  const handleManualSync = async () => {
    if (!syncCodeIsValid) {
      alert('同期コードが正しくありません。');
      return;
    }
    const nextConfig = { ...formData, workerUrl: formData.workerUrl.trim() || '/api/sync' };
    onSaveConfig(nextConfig);
    setIsSyncing(true);
    try {
      await onTriggerSync(nextConfig);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(notes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `memomemo_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-sync-title"
        className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 id="cloud-sync-title" className="text-base font-semibold">クラウド同期</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Cloudflareに暗号化して保存し、スマホとPCで同期
              </p>
            </div>
          </div>
          <button
            id="close-cloudflare-modal-btn"
            type="button"
            aria-label="クラウド同期設定を閉じる"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">同期ステータス</span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                {config.status === 'syncing' ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" /><span className="text-amber-500">同期中...</span></>
                ) : config.status === 'success' ? (
                  <><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400">クラウド保存済み</span></>
                ) : config.status === 'error' ? (
                  <><AlertCircle className="w-3.5 h-3.5 text-rose-500" /><span className="text-rose-500">同期エラー</span></>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-neutral-400" /><span className="text-neutral-500">未同期</span></>
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

          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              メモ本文は端末内で暗号化してから送信します
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Cloudflareには暗号化データだけを保存します。下の同期コードを同じものにした端末だけが復号できます。
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="cf-sync-code-input" className="text-xs font-semibold flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                同期コード
              </label>
              <button
                type="button"
                onClick={handleGenerateCode}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
              >
                {formData.syncCode ? '新しいコードを作る' : '同期コードを作る'}
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="cf-sync-code-input"
                  type={showSyncCode ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="別端末の同期コードを貼り付け"
                  value={formData.syncCode}
                  onChange={(e) => setFormData({ ...formData, syncCode: e.target.value.trim(), status: 'idle', errorMessage: null })}
                  className="w-full pr-10 pl-3 py-2 text-xs font-mono rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  aria-label={showSyncCode ? '同期コードを隠す' : '同期コードを表示'}
                  onClick={() => setShowSyncCode((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400"
                >
                  {showSyncCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                id="cf-copy-sync-code-btn"
                type="button"
                disabled={!syncCodeIsValid}
                onClick={handleCopyCode}
                className="px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
                title="同期コードをコピー"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              このコードを失うとクラウド上の暗号化メモは復号できません。別端末へ移すときにコピーしてください。
            </p>
          </div>

          <div className="space-y-3.5 border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                同期先URL
              </label>
              <input
                id="cf-worker-url-input"
                type="text"
                placeholder="/api/sync"
                value={formData.workerUrl}
                onChange={(e) => setFormData({ ...formData, workerUrl: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="mt-1 text-[10px] text-neutral-400">通常は /api/sync のままで変更不要です。</p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-xs font-medium">変更時の自動クラウド保存</span>
                <p className="text-[11px] text-neutral-500">編集から約3秒後に暗号化して同期します</p>
              </div>
              <input
                id="cf-auto-sync-toggle"
                type="checkbox"
                checked={formData.autoSync}
                onChange={(e) => setFormData({ ...formData, autoSync: e.target.checked })}
                className="w-4 h-4 rounded accent-amber-500"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
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
              disabled={isSyncing || !syncCodeIsValid}
              onClick={handleManualSync}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              今すぐ同期
            </button>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
              手動バックアップ / 復元
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-neutral-500" />
                JSON保存
              </button>
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-neutral-500" />
                JSONから復元
                <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
              </label>
            </div>
          </div>

          <p className="text-[10px] text-neutral-400 leading-relaxed">
            ※ 大きな添付ファイルを含むメモはCloudflare KVの1項目上限によりクラウド同期できない場合があります。その場合も端末内のメモは消えません。
          </p>
        </div>
      </div>
    </div>
  );
};
