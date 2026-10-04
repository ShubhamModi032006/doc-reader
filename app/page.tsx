'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { DocumentItem } from '@/components/DocumentList';
import { ChatPanel } from '@/components/ChatPanel';
import { DocViewer } from '@/components/DocViewer';
import { ComparePage } from '@/components/ComparePage';
import { RedlineForm } from '@/components/RedlineForm';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'compare' | 'redline'>('chat');
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const [targetPage, setTargetPage] = useState<number>(1);
  const [highlightOccurrence, setHighlightOccurrence] = useState<any>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocuments(data);
        // Auto-select first ready document if none selected
        if (selectedDocIds.length === 0 && data.length > 0) {
          const ready = data.find((d) => d.status === 'ready');
          if (ready) setSelectedDocIds([ready.id]);
        }
      }
    } catch (e) {
      console.error('Error loading documents:', e);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Poll processing status every 2 seconds for documents in transition
  useEffect(() => {
    const isProcessing = documents.some((d) =>
      ['uploading', 'extracting', 'chunking'].includes(d.status)
    );
    if (!isProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 2000);

    return () => clearInterval(interval);
  }, [documents]);

  const handleToggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenDoc = (id: string) => {
    setViewingDocId(id);
    setTargetPage(1);
    setHighlightOccurrence(null);
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      setSelectedDocIds((prev) => prev.filter((item) => item !== id));
      if (viewingDocId === id) setViewingDocId(null);
      fetchDocuments();
    } catch (e) {
      console.error('Delete document failed:', e);
    }
  };

  const handleSelectQuote = (documentId: string, pageNumber: number, occurrence: any) => {
    setViewingDocId(documentId);
    setTargetPage(pageNumber);
    setHighlightOccurrence(occurrence);
  };

  const documentsMap = documents.reduce((acc, d) => {
    acc[d.id] = d.name;
    return acc;
  }, {} as Record<string, string>);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 overflow-hidden font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedDocCount={selectedDocIds.length}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          documents={documents}
          selectedDocIds={selectedDocIds}
          onToggleSelectDoc={handleToggleSelectDoc}
          onOpenDoc={handleOpenDoc}
          onDeleteDoc={handleDeleteDoc}
          onRefreshDocs={fetchDocuments}
          activeChatId={activeChatId}
          onSelectChat={(id) => setActiveChatId(id)}
          onNewChat={() => setActiveChatId(null)}
        />

        {/* Main Center Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          {activeTab === 'chat' && (
            <ChatPanel
              chatId={activeChatId}
              selectedDocIds={selectedDocIds}
              documentsMap={documentsMap}
              onSelectQuote={handleSelectQuote}
              onNewChat={fetchDocuments}
            />
          )}

          {activeTab === 'compare' && <ComparePage documents={documents} />}

          {activeTab === 'redline' && <RedlineForm documents={documents} />}
        </main>

        {/* Collapsible Right Document Viewer */}
        {viewingDocId && (
          <div className="w-[45%] h-full">
            <DocViewer
              documentId={viewingDocId}
              targetPage={targetPage}
              highlightOccurrence={highlightOccurrence}
              onClose={() => setViewingDocId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
