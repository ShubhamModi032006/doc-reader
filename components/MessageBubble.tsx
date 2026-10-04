'use client';

import React, { useState } from 'react';
import { QuoteCard, QuoteData } from './QuoteCard';

export interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'completed' | 'stopped' | 'failed' | 'interrupted';
  provider_used?: string;
  fallback_reason?: string | null;
  quotes?: QuoteData[];
  coverage?: {
    searchedChunks: number;
    totalChunks: number;
    searchedPages: number;
    totalPages: number;
    isPartial: boolean;
  };
}

interface MessageBubbleProps {
  message: MessageData;
  documentsMap: Record<string, string>;
  onSelectQuote: (documentId: string, pageNumber: number, occurrence: any) => void;
  onRetry?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  documentsMap,
  onSelectQuote,
  onRetry,
}) => {
  const [hideUnverified, setHideUnverified] = useState(false);
  const isUser = message.role === 'user';

  const quotes = message.quotes || [];
  const verifiedCount = quotes.filter((q) => q.status === 'verified').length;
  const totalQuotes = quotes.length;

  const visibleQuotes = hideUnverified
    ? quotes.filter((q) => q.status === 'verified' || q.status === 'approximate')
    : quotes;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} my-4`}>
      <div
        className={`max-w-[85%] rounded-2xl p-4 shadow-sm transition-all ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-none'
            : 'bg-white dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/60 rounded-bl-none'
        }`}
      >
        {/* User / Assistant Header */}
        <div className="flex items-center justify-between gap-3 mb-2 text-xs font-semibold opacity-90">
          <span>{isUser ? 'You' : 'Contract Analyser Assistant'}</span>
          {!isUser && (
            <div className="flex items-center gap-1.5">
              {message.provider_used === 'groq' ? (
                <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold rounded-full border border-indigo-200 dark:border-indigo-800" title="Powered by Groq AI">
                  AI
                </span>
              ) : (
                <span
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-semibold rounded-full border border-slate-300 dark:border-slate-600 cursor-help"
                  title={message.fallback_reason ? `Fallback reason: ${message.fallback_reason}` : 'Basic search mode'}
                >
                  Basic search mode {message.fallback_reason ? `(${message.fallback_reason})` : ''}
                </span>
              )}
              {message.status === 'stopped' && (
                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] rounded-full border border-amber-300">
                  Stopped
                </span>
              )}
              {message.status === 'interrupted' && (
                <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-[10px] rounded-full border border-rose-300">
                  Interrupted
                </span>
              )}
            </div>
          )}
        </div>

        {/* Message Content */}
        <div className="text-sm whitespace-pre-wrap leading-relaxed font-sans">
          {message.content}
          {message.status === 'streaming' && (
            <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse" />
          )}
        </div>

        {/* Retry Button on Error / Interrupted */}
        {(message.status === 'failed' || message.status === 'interrupted') && onRetry && (
          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3">
            <span className="text-xs text-rose-500 font-medium">
              {message.status === 'interrupted'
                ? '⚠️ Response interrupted mid-stream.'
                : '⚠️ Response failed.'}
            </span>
            <button
              onClick={onRetry}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              🔄 Retry
            </button>
          </div>
        )}

        {/* Coverage Banner */}
        {message.coverage && message.coverage.isPartial && (
          <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>
              Searched {message.coverage.searchedChunks} of {message.coverage.totalChunks} sections.
              This answer may be incomplete.
            </span>
          </div>
        )}

        {/* Quotes Section */}
        {quotes.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Quotes Summary: {verifiedCount} of {totalQuotes} verified
              </span>

              {quotes.some((q) => q.status === 'unverified') && (
                <button
                  onClick={() => setHideUnverified(!hideUnverified)}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                >
                  {hideUnverified ? 'Show All Quotes' : 'Hide Unverified'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {visibleQuotes.map((q, idx) => (
                <QuoteCard
                  key={idx}
                  quote={q}
                  documentName={q.documentId ? documentsMap[q.documentId] : undefined}
                  onSelectQuote={onSelectQuote}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
