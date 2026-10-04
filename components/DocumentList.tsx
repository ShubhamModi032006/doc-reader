'use client';

import React from 'react';

export interface DocumentItem {
  id: string;
  name: string;
  file_type: 'pdf' | 'docx';
  file_size: number;
  page_count: number;
  status: 'uploading' | 'extracting' | 'chunking' | 'ready' | 'failed' | 'needs_ocr';
  error_message?: string;
  created_at: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  selectedDocIds: string[];
  onToggleSelect: (id: string) => void;
  onOpenDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  selectedDocIds,
  onToggleSelect,
  onOpenDoc,
  onDeleteDoc,
}) => {
  if (documents.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs">
        No contracts uploaded yet. Upload a PDF or DOCX file to begin.
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (doc: DocumentItem) => {
    switch (doc.status) {
      case 'ready':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-full">Ready</span>;
      case 'needs_ocr':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-full">Scanned (Needs OCR)</span>;
      case 'failed':
        return <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 rounded-full">Failed</span>;
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-full animate-pulse">
            Processing...
          </span>
        );
    }
  };

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const isSelected = selectedDocIds.includes(doc.id);
        return (
          <div
            key={doc.id}
            className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
              isSelected
                ? 'border-indigo-500/80 bg-indigo-50/40 dark:bg-indigo-950/30 dark:border-indigo-500/50'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(doc.id)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenDoc(doc.id)}
                  className="font-medium text-xs text-slate-800 dark:text-slate-100 truncate hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                >
                  {doc.name}
                </button>
                {getStatusBadge(doc)}
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="uppercase font-semibold">{doc.file_type}</span>
                <span>&bull;</span>
                <span>{formatSize(doc.file_size)}</span>
                {doc.page_count > 0 && (
                  <>
                    <span>&bull;</span>
                    <span>{doc.page_count} page{doc.page_count > 1 ? 's' : ''}</span>
                  </>
                )}
              </div>

              {doc.error_message && (
                <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-1.5 rounded-lg border border-rose-200/60 dark:border-rose-900/40">
                  {doc.error_message}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                if (confirm(`Delete document "${doc.name}"? This deletes chats and stored files.`)) {
                  onDeleteDoc(doc.id);
                }
              }}
              className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs p-1"
              title="Delete Document"
            >
              🗑️
            </button>
          </div>
        );
      })}
    </div>
  );
};
