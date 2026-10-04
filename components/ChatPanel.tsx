'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageBubble, MessageData } from './MessageBubble';

interface ChatPanelProps {
  chatId: string | null;
  selectedDocIds: string[];
  documentsMap: Record<string, string>;
  onSelectQuote: (documentId: string, pageNumber: number, occurrence: any) => void;
  onNewChat: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chatId,
  selectedDocIds,
  documentsMap,
  onSelectQuote,
  onNewChat,
}) => {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [simulateBadQuote, setSimulateBadQuote] = useState(false);
  const [isScanAll, setIsScanAll] = useState(false);

  const [toast, setToast] = useState<{ message: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages when chatId changes
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    fetch(`/api/chats/${chatId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch((e) => console.error('Failed to load chat history:', e));
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputQuestion.trim() || isStreaming) return;
    const question = inputQuestion;
    setInputQuestion('');

    let currentChatId = chatId;

    // Auto-create chat if none active
    if (!currentChatId) {
      try {
        const res = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentIds: selectedDocIds, title: question.slice(0, 30) }),
        });
        const newChat = await res.json();
        currentChatId = newChat.id;
        onNewChat();
      } catch (err) {
        console.error('Failed to create chat:', err);
        return;
      }
    }

    // Add local user message & assistant placeholder
    const userMsg: MessageData = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: question,
      status: 'completed',
    };

    const assistantMsg: MessageData = {
      id: `ast-${Date.now()}`,
      role: 'assistant',
      content: '',
      status: 'streaming',
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`/api/chats/${currentChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          question,
          simulateBadQuote,
          isScanAll,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to send question');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const eventMatch = line.match(/^event:\s*(\w+)/m);
          const dataMatch = line.match(/^data:\s*(.*)$/m);

          if (eventMatch && dataMatch) {
            const eventName = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);

            if (eventName === 'text') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, content: data.accumulated } : m
                )
              );
            } else if (eventName === 'coverage') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, coverage: data } : m
                )
              );
            } else if (eventName === 'quotes') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, quotes: data } : m
                )
              );
            } else if (eventName === 'meta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, provider_used: data.providerUsed, fallback_reason: data.fallbackReason }
                    : m
                )
              );
              if (data.providerUsed === 'manual' && data.fallbackReason) {
                setToast({
                  message: `AI is unavailable, answered using basic search instead. (${data.fallbackReason})`,
                });
                setTimeout(() => setToast(null), 6000);
              }
            } else if (eventName === 'interrupted') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id ? { ...m, status: 'interrupted' } : m
                )
              );
            } else if (eventName === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        status: data.status,
                        provider_used: data.providerUsed || m.provider_used,
                        fallback_reason: data.fallbackReason || m.fallback_reason,
                      }
                    : m
                )
              );
              if (data.providerUsed === 'manual' && data.fallbackReason) {
                setToast({
                  message: `AI is unavailable, answered using basic search instead. (${data.fallbackReason})`,
                });
                setTimeout(() => setToast(null), 6000);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, status: 'stopped' } : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, status: 'failed' } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/40 relative">
      {/* Toast notification for fallback */}
      {toast && (
        <div className="mx-4 mt-2 p-3 bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between shadow-md transition-all">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-amber-700 hover:text-amber-900 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Dev Flag Toggles Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={simulateBadQuote}
              onChange={(e) => setSimulateBadQuote(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            🧪 Dev Flag: Simulate Bad Quotes
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={isScanAll}
              onChange={(e) => setIsScanAll(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            🔎 Scan All Sections (100% Coverage)
          </label>
        </div>

        {selectedDocIds.length > 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Active Docs: {selectedDocIds.map((id) => documentsMap[id] || id).join(', ')}
          </span>
        )}
      </div>

      {/* Messages Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl mb-3">
              💡
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ask any question about your contracts
            </h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Answers will be generated with verified quotes linked directly to original document pages.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              documentsMap={documentsMap}
              onSelectQuote={onSelectQuote}
              onRetry={handleSend}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isStreaming}
            placeholder={
              selectedDocIds.length === 0
                ? 'Select a document from the left sidebar to start...'
                : 'Ask a question about the selected contract(s)...'
            }
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />

          {isStreaming ? (
            <button
              onClick={handleStop}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
            >
              ⏹ Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputQuestion.trim() || selectedDocIds.length === 0}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5"
            >
              Send 🚀
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
