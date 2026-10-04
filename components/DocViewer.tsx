'use client';

import React, { useEffect, useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker using unpkg CDN with legacy fallback
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

interface DocViewerProps {
  documentId: string | null;
  targetPage?: number;
  highlightOccurrence?: {
    startChar: number;
    endChar: number;
    pageNumbers: number[];
    matchedText: string;
  } | null;
  onClose?: () => void;
}

export const DocViewer: React.FC<DocViewerProps> = ({
  documentId,
  targetPage = 1,
  highlightOccurrence,
  onClose,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(targetPage);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pagesData, setPagesData] = useState<any[]>([]);
  const [highlights, setHighlights] = useState<Array<{ x0: number; y0: number; x1: number; y1: number }>>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    if (targetPage) setCurrentPage(targetPage);
  }, [targetPage]);

  // Fetch document pages metadata (words_json)
  useEffect(() => {
    if (!documentId) return;
    fetch(`/api/documents/${documentId}/pages`)
      .then((res) => res.json())
      .then((data) => setPagesData(Array.isArray(data) ? data : []))
      .catch((e) => console.error('Failed to load page word boxes:', e));
  }, [documentId]);

  // Load PDF file
  useEffect(() => {
    if (!documentId) return;
    setLoading(true);
    setErrorMsg(null);

    const pdfUrl = `/api/documents/${documentId}/file`;
    const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });

    loadingTask.promise
      .then((pdf) => {
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
        if (pdf.numPages > 0) {
          renderPage(Math.min(currentPage, pdf.numPages), pdf);
        } else {
          setErrorMsg('Document has 0 pages or failed extraction.');
        }
      })
      .catch((err) => {
        console.error('Error loading PDF canvas:', err);
        setErrorMsg('Failed to load PDF document. If this was uploaded earlier, please delete and re-upload it.');
        setLoading(false);
      });

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
        renderTaskRef.current = null;
      }
    };
  }, [documentId]);

  // Render page onto canvas
  const renderPage = async (pageNo: number, pdfDoc = pdfDocRef.current) => {
    if (!pdfDoc || !canvasRef.current || pageNo <= 0) return;

    // Cancel any previous render task on this canvas
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (_) {}
      renderTaskRef.current = null;
    }

    try {
      const page = await pdfDoc.getPage(pageNo);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Calculate highlight rectangles for current page
      if (highlightOccurrence && pagesData.length > 0) {
        const pageMeta = pagesData.find((p) => p.page_number === pageNo);
        if (pageMeta && pageMeta.words_json) {
          const words = pageMeta.words_json;
          const rects: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

          for (const w of words) {
            if (w.charStart <= highlightOccurrence.endChar && w.charEnd >= highlightOccurrence.startChar) {
              if (w.bbox && w.bbox.length === 4) {
                const [x0, y0, x1, y1] = w.bbox;
                rects.push({
                  x0: x0 * scale,
                  y0: y0 * scale,
                  x1: x1 * scale,
                  y1: y1 * scale,
                });
              }
            }
          }

          setHighlights(rects);
        }
      } else {
        setHighlights([]);
      }
    } catch (e: any) {
      if (e?.name === 'RenderingCancelledException' || e?.message?.includes('cancelled')) {
        return;
      }
      console.error('Page render error:', e);
    }
  };

  useEffect(() => {
    if (pdfDocRef.current && numPages > 0) {
      renderPage(currentPage);
    }
  }, [currentPage, scale, highlightOccurrence, pagesData, numPages]);

  if (!documentId) return null;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white border-l border-slate-800 shadow-2xl">
      {/* Viewer Header */}
      <div className="h-12 border-b border-slate-800 bg-slate-950 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-200">Document Viewer</span>
          {loading && <span className="text-indigo-400 animate-pulse">Loading PDF...</span>}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || numPages === 0}
            className="p-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
          >
            ◀ Prev
          </button>
          <span>
            Page {numPages > 0 ? currentPage : 0} of {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages || numPages === 0}
            className="p-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
          >
            Next ▶
          </button>

          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
            disabled={numPages === 0}
            className="p-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
          >
            🔍 +
          </button>
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            disabled={numPages === 0}
            className="p-1 px-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
          >
            🔍 -
          </button>

          {onClose && (
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white ml-2">
              ✖
            </button>
          )}
        </div>
      </div>

      {/* Canvas Container */}
      <div className="flex-1 overflow-auto p-4 flex justify-center items-center relative bg-slate-950">
        {errorMsg ? (
          <div className="max-w-md p-6 bg-slate-900 border border-red-500/40 rounded-xl text-center shadow-xl">
            <div className="text-red-400 font-semibold mb-2">Document Viewing Notice</div>
            <div className="text-xs text-slate-300 mb-4">{errorMsg}</div>
            <button
              onClick={() => {
                setLoading(true);
                setErrorMsg(null);
                const loadingTask = pdfjsLib.getDocument({ url: `/api/documents/${documentId}/file` });
                loadingTask.promise
                  .then((pdf) => {
                    pdfDocRef.current = pdf;
                    setNumPages(pdf.numPages);
                    setLoading(false);
                    renderPage(1, pdf);
                  })
                  .catch(() => {
                    setLoading(false);
                    setErrorMsg('Unable to render PDF. Please delete this file from the left sidebar and re-upload.');
                  });
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium rounded-md transition-colors"
            >
              Retry Loading
            </button>
          </div>
        ) : (
          <div className="relative inline-block border border-slate-800 shadow-2xl rounded-md overflow-hidden">
            <canvas ref={canvasRef} className="block" />

            {/* Highlight overlays */}
            {highlights.map((rect, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${rect.x0}px`,
                  top: `${rect.y0}px`,
                  width: `${rect.x1 - rect.x0}px`,
                  height: `${rect.y1 - rect.y0}px`,
                }}
                className="bg-yellow-400/40 border-2 border-amber-500 rounded-sm animate-pulse transition-all pointer-events-none shadow-lg shadow-amber-500/50"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
