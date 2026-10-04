'use client';

import React, { useEffect, useState } from 'react';
import { UploadBox } from './UploadBox';
import { DocumentList, DocumentItem } from './DocumentList';

interface SidebarProps {
  documents: DocumentItem[];
  selectedDocIds: string[];
  onToggleSelectDoc: (id: string) => void;
  onOpenDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
  onRefreshDocs: () => void;
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  selectedDocIds,
  onToggleSelectDoc,
  onOpenDoc,
  onDeleteDoc,
  onRefreshDocs,
  activeChatId,
  onSelectChat,
  onNewChat,
}) => {
  const [chats, setChats] = useState<any[]>([]);

  const fetchChats = () => {
    fetch('/api/chats')
      .then((res) => res.json())
      .then((data) => setChats(data || []))
      .catch((e) => console.error('Error fetching chats:', e));
  };

  useEffect(() => {
    fetchChats();
  }, [activeChatId]);

  return (
    <aside className="w-80 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      {/* Upload Box */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <UploadBox onUploadSuccess={onRefreshDocs} />
      </div>

      {/* Scrollable Library & Chats */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Document Library Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Contract Library ({documents.length})
            </h3>
            {selectedDocIds.length > 0 && (
              <span className="text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                {selectedDocIds.length} Selected
              </span>
            )}
          </div>

          <DocumentList
            documents={documents}
            selectedDocIds={selectedDocIds}
            onToggleSelect={onToggleSelectDoc}
            onOpenDoc={onOpenDoc}
            onDeleteDoc={onDeleteDoc}
          />
        </div>

        {/* Saved Chats Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Conversations
            </h3>
            <button
              onClick={onNewChat}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + New Chat
            </button>
          </div>

          <div className="space-y-1">
            {chats.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No active chats.</p>
            ) : (
              chats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectChat(c.id)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all truncate block ${
                    activeChatId === c.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200/60 dark:border-indigo-800/50'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  💬 {c.title || 'Untitled Chat'}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
