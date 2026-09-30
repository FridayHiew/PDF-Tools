import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Loader2,
  FileText,
} from 'lucide-react';
import { usePdfStore } from '../store/pdfStore.ts';
import { renderPageOnCanvas } from '../services/pdfRenderer.ts';

export const PreviewModal: React.FC = () => {
  const { previewModal, closePreview, setPreviewPage } = usePdfStore();
  const { isOpen, documentId, documentName, currentPage, totalPages } = previewModal;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState<number>(1.2);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setScale(1.2);
      setRenderError(null);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
      if (e.key === 'ArrowRight' && currentPage < totalPages) setPreviewPage(currentPage + 1);
      if (e.key === 'ArrowLeft' && currentPage > 1) setPreviewPage(currentPage - 1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentPage, totalPages, closePreview, setPreviewPage]);

  // Render canvas when document, page, or scale changes
  useEffect(() => {
    if (!isOpen || !documentId || !canvasRef.current) return;

    let isMounted = true;
    let cancelRender: (() => void) | null = null;

    const render = async () => {
      try {
        setIsRendering(true);
        setRenderError(null);
        const viewUrl = `/api/pdf/${documentId}/view`;

        if (canvasRef.current) {
          const res = await renderPageOnCanvas(
            viewUrl,
            currentPage,
            canvasRef.current,
            scale,
            documentId
          );
          cancelRender = res.cancel;
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Preview render error:', err);
          setRenderError(err.message || 'Failed to render PDF page');
        }
      } finally {
        if (isMounted) {
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      isMounted = false;
      if (cancelRender) cancelRender();
    };
  }, [isOpen, documentId, currentPage, scale]);

  if (!isOpen || !documentId) return null;

  const handleZoomIn = () => setScale((s) => Math.min(3.0, Number((s + 0.25).toFixed(2))));
  const handleZoomOut = () => setScale((s) => Math.max(0.5, Number((s - 0.25).toFixed(2))));
  const handleResetZoom = () => setScale(1.2);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="h-16 px-4 sm:px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="truncate">
            <h3 className="text-sm font-semibold truncate text-slate-100">{documentName || 'Document Preview'}</h3>
            <p className="text-xs text-slate-400">
              Page {currentPage} of {totalPages}
            </p>
          </div>
        </div>

        {/* Center Controls: Page Navigation & Zoom */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => currentPage > 1 && setPreviewPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition text-slate-300"
              title="Previous Page (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs px-2 font-mono text-slate-200">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => currentPage < totalPages && setPreviewPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition text-slate-300"
              title="Next Page (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 transition"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              className="text-[11px] px-1.5 py-0.5 rounded text-slate-300 hover:text-white font-mono"
              title="Reset Zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 transition"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Actions: Download & Close */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/pdf/${documentId}/download`}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            onClick={closePreview}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center relative">
        {isRendering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-xs text-slate-200">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Rendering page...</span>
            </div>
          </div>
        )}

        {renderError ? (
          <div className="p-6 max-w-md rounded-2xl bg-rose-950/40 border border-rose-800 text-center text-rose-200">
            <p className="font-semibold text-sm">Failed to render page preview</p>
            <p className="text-xs text-rose-300/80 mt-1">{renderError}</p>
            <button
              onClick={() => setScale(1.0)}
              className="mt-4 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-xs font-medium text-white inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        ) : (
          <div className="shadow-2xl rounded-sm overflow-hidden bg-white max-w-full">
            <canvas ref={canvasRef} className="block transition-all duration-150" />
          </div>
        )}
      </div>
    </div>
  );
};
