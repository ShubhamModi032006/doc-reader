'use client';

import React, { useState } from 'react';
import { DocumentItem } from './DocumentList';

interface RedlineFormProps {
  documents: DocumentItem[];
}

export const RedlineForm: React.FC<RedlineFormProps> = ({ documents }) => {
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [instruction, setInstruction] = useState<string>('');
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const [edits, setEdits] = useState<Array<{ find_text: string; replace_text: string }>>([
    { find_text: '', replace_text: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [editsApplied, setEditsApplied] = useState<number>(0);

  const docxDocs = documents.filter((d) => d.file_type === 'docx' && d.status === 'ready');

  const handleAddRow = () => {
    setEdits([...edits, { find_text: '', replace_text: '' }]);
  };

  const handleRemoveRow = (idx: number) => {
    setEdits(edits.filter((_, i) => i !== idx));
  };

  const handleEditChange = (idx: number, field: 'find_text' | 'replace_text', val: string) => {
    const next = [...edits];
    next[idx][field] = val;
    setEdits(next);
  };

  const handleSuggestEdits = async () => {
    if (!selectedDocId || !instruction.trim()) return;
    setSuggestLoading(true);
    setAiNotice(null);

    try {
      const res = await fetch('/api/redline/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: selectedDocId,
          instruction: instruction.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestions');

      if (data.aiUnavailable) {
        setAiNotice('AI suggestions unavailable, enter the change manually.');
      } else if (data.validEdits && data.validEdits.length > 0) {
        setEdits(data.validEdits);
        if (data.rejectedCount > 0) {
          setAiNotice(`Generated ${data.validEdits.length} edit(s). ${data.rejectedCount} suggestion(s) were rejected because the target text was not found verbatim in the document.`);
        } else {
          setAiNotice(`Generated ${data.validEdits.length} validated edit suggestion(s).`);
        }
      } else {
        setAiNotice('No valid edit suggestions were found for this instruction.');
      }
    } catch (err: any) {
      setAiNotice('AI suggestions unavailable, enter the change manually.');
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleApplyRedlines = async () => {
    if (!selectedDocId || edits.some((e) => !e.find_text.trim())) return;
    setLoading(true);
    setDownloadUrl(null);

    try {
      const res = await fetch('/api/redline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: selectedDocId,
          edits: edits.map((e) => ({
            find_text: e.find_text.trim(),
            replace_text: e.replace_text.trim(),
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Redlining failed');

      setDownloadUrl(data.downloadUrl);
      setEditsApplied(data.editsApplied);
    } catch (err: any) {
      alert(err.message || 'Failed to apply redlines');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 p-6 overflow-y-auto max-w-4xl mx-auto">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
          Tracked-Change DOCX Redlines (OpenXML)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          Specify exact target text replacements or ask AI to suggest edits. Redlines are inserted directly into the DOCX XML structure with standard Word tracked changes (<code className="text-indigo-600 dark:text-indigo-400">&lt;w:del&gt;</code> and <code className="text-indigo-600 dark:text-indigo-400">&lt;w:ins&gt;</code> tags).
        </p>

        {/* DOCX Selector */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Select DOCX Contract
          </label>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-white"
          >
            <option value="">Choose a DOCX document...</option>
            {docxDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.page_count} pages)
              </option>
            ))}
          </select>
          {docxDocs.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ No DOCX files uploaded yet. Please upload a .docx contract first.
            </p>
          )}
        </div>

        {/* AI Suggest Edits Box */}
        <div className="mb-6 p-4 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl">
          <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">
            ✨ Ask AI to Suggest Redline Edits
          </label>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3">
            Describe what changes you want to make to the selected document. The AI will find exact matching text and suggest replacements.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Change payment terms to 60 days and cap liability at 500,000 AED"
              disabled={!selectedDocId || suggestLoading}
              className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
            />
            <button
              onClick={handleSuggestEdits}
              disabled={!selectedDocId || !instruction.trim() || suggestLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5"
            >
              {suggestLoading ? 'Thinking...' : 'Suggest Edits 🪄'}
            </button>
          </div>

          {aiNotice && (
            <p className="text-[11px] font-medium mt-2 text-indigo-700 dark:text-indigo-300">
              {aiNotice}
            </p>
          )}
        </div>

        {/* Edits List */}
        <div className="space-y-3 mb-6">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Redline Edits List (Preview & Edit)
          </label>

          {edits.map((edit, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Find text in document..."
                value={edit.find_text}
                onChange={(e) => handleEditChange(idx, 'find_text', e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />

              <span className="text-slate-400 font-bold text-xs">➔</span>

              <input
                type="text"
                placeholder="Replace with new text..."
                value={edit.replace_text}
                onChange={(e) => handleEditChange(idx, 'replace_text', e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />

              {edits.length > 1 && (
                <button
                  onClick={() => handleRemoveRow(idx)}
                  className="p-2 text-rose-600 hover:text-rose-700 text-xs font-bold"
                >
                  ✖
                </button>
              )}
            </div>
          ))}

          <button
            onClick={handleAddRow}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            + Add Another Edit
          </button>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleApplyRedlines}
          disabled={!selectedDocId || edits.some((e) => !e.find_text.trim()) || loading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all"
        >
          {loading ? 'Injecting Tracked Changes into DOCX XML...' : 'Generate Tracked-Change Redline DOCX'}
        </button>

        {/* Download Result */}
        {downloadUrl && (
          <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                ✅ Redline DOCX Generated Successfully!
              </h4>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                Applied {editsApplied} tracked change edits across document paragraphs.
              </p>
            </div>

            <a
              href={downloadUrl}
              download
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-md shadow-emerald-600/20"
            >
              📥 Download Redlined .docx
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
