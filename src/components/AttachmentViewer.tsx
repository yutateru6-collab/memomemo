import React, { useState } from 'react';
import { AttachmentItem } from '../types';
import { X, Download, FileText, ExternalLink } from 'lucide-react';

interface AttachmentViewerProps {
  attachment: AttachmentItem | null;
  onClose: () => void;
}

export const AttachmentViewer: React.FC<AttachmentViewerProps> = ({ attachment, onClose }) => {
  const [zoom, setZoom] = useState<number>(1);

  if (!attachment) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.dataUrl;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      id="attachment-lightbox-overlay"
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm text-white"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="attachment-mobile-header flex items-center justify-between gap-2 px-4 py-3 bg-neutral-900/90 border-b border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 truncate max-w-[70%]">
          {attachment.type === 'pdf' ? (
            <FileText className="w-5 h-5 text-red-400 shrink-0" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{attachment.name}</span>
          <span className="text-xs text-neutral-400 shrink-0">
            ({(attachment.size / 1024).toFixed(1)} KB)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="attachment-download-btn"
            type="button"
            onClick={handleDownload}
            className="justify-center inline-flex min-h-11 min-w-11 flex items-center gap-1 text-xs bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-full transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>保存</span>
          </button>
          <button
            id="attachment-close-btn"
            type="button"
            onClick={onClose}
            className="justify-center items-center inline-flex min-h-11 min-w-11 p-1 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className="attachment-safe-content flex-1 flex items-center justify-center p-4 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {attachment.type === 'image' ? (
          <div className="flex flex-col items-center max-h-full">
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
              onClick={() => setZoom((z) => (z === 1 ? 1.5 : 1))}
            />
            <span className="text-xs text-neutral-400 mt-2">クリックで拡大 / 縮小</span>
          </div>
        ) : attachment.type === 'pdf' ? (
          <div className="w-full max-w-4xl h-[78vh] flex flex-col bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800">
            <div className="flex items-center justify-between p-3 bg-neutral-800/80 border-b border-neutral-700">
              <span className="text-xs text-neutral-300">PDFプレビュー</span>
              <a
                href={attachment.dataUrl}
                target="_blank"
                rel="noreferrer"
                className="min-h-11 inline-flex items-center gap-1 text-xs text-amber-400 hover:underline"
              >
                別ウィンドウで開く
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <iframe
              src={attachment.dataUrl}
              title={attachment.name}
              className="w-full flex-1 bg-white"
            />
          </div>
        ) : (
          <div className="text-center p-8 bg-neutral-900 rounded-2xl border border-neutral-800">
            <FileText className="w-16 h-16 text-neutral-500 mx-auto mb-4" />
            <p className="text-sm font-medium mb-1">{attachment.name}</p>
            <p className="text-xs text-neutral-400 mb-4">このファイル形式はプレビューできません</p>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-11 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-black font-semibold text-sm rounded-xl"
            >
              <Download className="w-4 h-4" />
              ダウンロードして開く
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
