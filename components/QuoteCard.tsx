'use client';

import React, { useState } from 'react';

export interface QuoteData {
  quoteText: string;
  documentId?: string;
  status: 'verified' | 'approximate' | 'unverified' | 'too_short';
  similarity: number;
  occurrences: Array<{
    startChar: number;
    endChar: number;
    pageNumbers: number[];
    matchedText: string;
  }>;
  message?: string;
}

interface QuoteCardProps {
  quote: QuoteData;
  documentName?: string;
  onSelectQuote: (documentId: string, pageNumber: number, occurrence: any) => void;
}

export const QuoteCard: React.FC<QuoteCardProps> = ({ quote, documentName, onSelectQuote }) => {
  const [currentOccIdx, setCurrentOccIdx] = useState(0);

  const isClickable = quote.status === 'verified' || quote.status === 'approximate';
  const totalOcc = quote.occurrences?.length || 0;
  const currentOcc = totalOcc > 0 ? quote.occurrences[currentOccIdx] : null;

  const handleClick = () => {
    if (isClickable && currentOcc && quote.documentId) {
      const targetPage = currentOcc.pageNumbers[0] || 1;
      onSelectQuote(quote.documentId, targetPage, currentOcc);
    }
  };

  const getBadgeStyle = () => {
    switch (quote.status) {
      case 'verified':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-800/60';
      case 'approximate':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/80 dark:border-amber-800/60';
      case 'too_short':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
      default:
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/80 dark:border-rose-800/60';
    }
  };

  const getIcon = () => {
    switch (quote.status) {
      case 'verified':
        return '✅ Verified';
      case 'approximate':
        return '⚠️ Approximate';
      case 'too_short':
        return 'ℹ️ Too short';
      default:
        return '❌ Unverified';
    }
  };

  return (
    <div className="mt-2 text-xs rounded-xl border p-3 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm border-slate-200/80 dark:border-slate-800 shadow-sm transition-all hover:shadow">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] border ${getBadgeStyle()}`}>
            {getIcon()}
          </span>

          {documentName && (
            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 rounded-full font-medium text-[10px]">
              📄 {documentName}
            </span>
          )}

          {currentOcc && currentOcc.pageNumbers.length > 0 && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Page {currentOcc.pageNumbers.join(', ')}
            </span>
          )}
        </div>

        {totalOcc > 1 && (
          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
            <button
              disabled={currentOccIdx === 0}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentOccIdx((prev) => Math.max(0, prev - 1));
              }}
              className="disabled:opacity-40 hover:text-indigo-600"
            >
              ◀
            </button>
            <span>
              {currentOccIdx + 1} of {totalOcc}
            </span>
            <button
              disabled={currentOccIdx === totalOcc - 1}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentOccIdx((prev) => Math.min(totalOcc - 1, prev + 1));
              }}
              className="disabled:opacity-40 hover:text-indigo-600"
            >
              ▶
            </button>
          </div>
        )}
      </div>

      <blockquote
        onClick={handleClick}
        className={`italic pl-3 border-l-2 py-1 my-1 text-slate-700 dark:text-slate-300 font-mono text-[11px] leading-relaxed transition-all ${
          isClickable
            ? 'border-indigo-500 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 rounded-r-md'
            : 'border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-85'
        }`}
        title={isClickable ? 'Click to jump to citation in document viewer' : 'Unverified quote cannot be jumped to'}
      >
        "{quote.quoteText}"
      </blockquote>

      {quote.message && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          {quote.message}
        </p>
      )}
    </div>
  );
};
