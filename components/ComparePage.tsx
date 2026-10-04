'use client';

import React, { useState } from 'react';
import { DocumentItem } from './DocumentList';

interface ComparePageProps {
  documents: DocumentItem[];
}

export const ComparePage: React.FC<ComparePageProps> = ({ documents }) => {
  const [docAId, setDocAId] = useState<string>('');
  const [docBId, setDocBId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [compareData, setCompareData] = useState<any>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSig, setFilterSig] = useState<string>('all');

  const handleRunCompare = async () => {
    if (!docAId || !docBId || docAId === docBId) return;
    setLoading(true);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docAId, docBId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed');
      setCompareData(data);
    } catch (err: any) {
      alert(err.message || 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const readyDocs = documents.filter((d) => d.status === 'ready');

  const filteredDiffs = (compareData?.diffs || []).filter((d: any) => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (filterSig !== 'all' && d.significance !== filterSig) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6 overflow-y-auto">
      {/* Pickers Header */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
          Select Two Document Versions to Compare
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Version A (Base Document)
            </label>
            <select
              value={docAId}
              onChange={(e) => setDocAId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-white"
            >
              <option value="">Select Document A...</option>
              {readyDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Version B (Revised Document)
            </label>
            <select
              value={docBId}
              onChange={(e) => setDocBId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-white"
            >
              <option value="">Select Document B...</option>
              {readyDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleRunCompare}
          disabled={!docAId || !docBId || docAId === docBId || loading}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/20"
        >
          {loading ? 'Analyzing Clause Differences...' : 'Compare Clauses & Generate Redlines'}
        </button>
      </div>

      {/* Results Section */}
      {compareData && (
        <div className="space-y-4">
          {/* Overview Banner */}
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                {compareData.overviewBanner}
              </h3>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                Comparing {compareData.docA?.name} vs {compareData.docB?.name}
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterSig}
                onChange={(e) => setFilterSig(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
              >
                <option value="all">All Significance</option>
                <option value="HIGH">HIGH Only</option>
                <option value="MEDIUM">MEDIUM Only</option>
                <option value="LOW">LOW Only</option>
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
              >
                <option value="all">All Change Types</option>
                <option value="modified">Modified</option>
                <option value="added">Added</option>
                <option value="removed">Removed</option>
                <option value="moved">Moved</option>
              </select>
            </div>
          </div>

          {/* Diffs List */}
          <div className="space-y-3">
            {filteredDiffs.map((diff: any) => (
              <div
                key={diff.id}
                className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        diff.significance === 'HIGH'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : diff.significance === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {diff.significance}
                    </span>

                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">
                      {diff.summary}
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold uppercase text-slate-500">
                    {diff.type}
                  </span>
                </div>

                {/* Side-by-side text comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs">
                  <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 rounded-xl">
                    <span className="font-semibold text-[10px] text-rose-700 dark:text-rose-400 block mb-1">
                      Version A
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono text-[11px]">
                      {diff.textA || '— (Not present in Version A)'}
                    </p>
                  </div>

                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-xl">
                    <span className="font-semibold text-[10px] text-emerald-700 dark:text-emerald-400 block mb-1">
                      Version B
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono text-[11px]">
                      {diff.textB || '— (Not present in Version B)'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
