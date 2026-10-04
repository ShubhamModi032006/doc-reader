'use client';

import React, { useEffect, useState } from 'react';

interface HeaderProps {
  activeTab: 'chat' | 'compare' | 'redline';
  setActiveTab: (tab: 'chat' | 'compare' | 'redline') => void;
  selectedDocCount: number;
}

interface StatusData {
  configured: boolean;
  provider: string;
  reachable: boolean;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, selectedDocCount }) => {
  const [status, setStatus] = useState<StatusData | null>(null);

  useEffect(() => {
    fetch('/api/llm/status')
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch((e) => console.error('Failed to fetch LLM status:', e));
  }, []);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between z-10 sticky top-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
          ⚖️
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-slate-900 dark:text-white text-lg leading-none">
              Legal Contract Analyser
            </h1>
            {status && (
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                  status.provider === 'groq' && status.reachable
                    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300'
                    : status.provider === 'groq' && !status.reachable
                    ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300'
                }`}
                title={
                  status.provider === 'groq'
                    ? status.reachable
                      ? 'Groq API connected'
                      : 'Groq API unreachable - Fallback active'
                    : 'Basic Search Mode (Manual Provider)'
                }
              >
                {status.provider === 'groq'
                  ? status.reachable
                    ? '⚡ Groq AI (Online)'
                    : '⚠️ Groq AI (Offline)'
                  : '🔍 Basic Search Mode'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Verified Quotes &bull; Redlining &bull; Side-by-Side Comparison
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/50">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'chat'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          💬 Chat {selectedDocCount > 0 && `(${selectedDocCount})`}
        </button>

        <button
          onClick={() => setActiveTab('compare')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'compare'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          🔍 Compare Docs
        </button>

        <button
          onClick={() => setActiveTab('redline')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'redline'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          ✏️ Tracked Redlines
        </button>
      </nav>
    </header>
  );
};
