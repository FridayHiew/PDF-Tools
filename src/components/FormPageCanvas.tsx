import React, { useRef, useEffect, useState } from 'react';
import { renderPageOnCanvas } from '../services/pdfRenderer.ts';
import { FormAnnotation, AnnotationType } from '../types/pdf.ts';
import { X, Move, Check, Plus, Minus, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface FormPageCanvasProps {
  documentId: string;
  currentPage: number;
  zoom: number; // e.g. 1.0, 1.25, 1.5
  activeTool: 'select' | AnnotationType;
  activeSignature?: string;
  annotations: FormAnnotation[];
  onAddAnnotation: (ann: FormAnnotation) => void;
  onUpdateAnnotation: (id: string, updates: Partial<FormAnnotation>) => void;
  onDeleteAnnotation: (id: string) => void;
  onRequestSignatureModal: () => void;
}

export const FormPageCanvas: React.FC<FormPageCanvasProps> = ({
  documentId,
  currentPage,
  zoom,
  activeTool,
  activeSignature,
  annotations,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onRequestSignatureModal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 600, height: 800 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  // Dragging state with pointer capture
  const draggingId = useRef<string | null>(null);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; annX: number; annY: number }>({
    mouseX: 0,
    mouseY: 0,
    annX: 0,
    annY: 0,
  });

  // Filter annotations for current page
  const pageAnnotations = annotations.filter((a) => a.page === currentPage);

  // Render PDF page
  useEffect(() => {
    let cancelRender: (() => void) | undefined;
    let isMounted = true;

    const render = async () => {
      if (!canvasRef.current || !documentId) return;
      try {
        setIsLoading(true);
        setError(null);
        const viewUrl = `/api/pdf/${documentId}/view`;
        const res = await renderPageOnCanvas(
          viewUrl,
          currentPage,
          canvasRef.current,
          zoom * 1.2, // crisp scaling
          documentId
        );
        if (isMounted) {
          setDimensions({ width: res.width, height: res.height });
          cancelRender = res.cancel;
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Canvas render error:', err);
          setError(err.message || 'Failed to render PDF page');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    render();

    return () => {
      isMounted = false;
      if (cancelRender) cancelRender();
    };
  }, [documentId, currentPage, zoom]);

  // Click on canvas container to place annotation
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If clicking directly on an existing annotation element, don't create a new one
    if ((e.target as HTMLElement).closest('[data-annotation-element]')) {
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const percentX = Math.max(0, Math.min(95, (clickX / rect.width) * 100));
    const percentY = Math.max(0, Math.min(95, (clickY / rect.height) * 100));

    if (activeTool === 'select') {
      setSelectedAnnId(null);
      return;
    }

    if (activeTool === 'text') {
      const newAnn: FormAnnotation = {
        id: uuidv4(),
        page: currentPage,
        type: 'text',
        x: percentX,
        y: percentY,
        text: 'Type text here',
        fontSize: 13,
        color: '#0f172a',
      };
      onAddAnnotation(newAnn);
      setSelectedAnnId(newAnn.id);
    } else if (activeTool === 'check') {
      const newAnn: FormAnnotation = {
        id: uuidv4(),
        page: currentPage,
        type: 'check',
        x: percentX,
        y: percentY,
        fontSize: 16,
        color: '#16a34a',
      };
      onAddAnnotation(newAnn);
      setSelectedAnnId(newAnn.id);
    } else if (activeTool === 'cross') {
      const newAnn: FormAnnotation = {
        id: uuidv4(),
        page: currentPage,
        type: 'cross',
        x: percentX,
        y: percentY,
        fontSize: 16,
        color: '#dc2626',
      };
      onAddAnnotation(newAnn);
      setSelectedAnnId(newAnn.id);
    } else if (activeTool === 'date') {
      const today = new Date().toISOString().slice(0, 10);
      const newAnn: FormAnnotation = {
        id: uuidv4(),
        page: currentPage,
        type: 'date',
        x: percentX,
        y: percentY,
        text: today,
        fontSize: 12,
        color: '#0f172a',
      };
      onAddAnnotation(newAnn);
      setSelectedAnnId(newAnn.id);
    } else if (activeTool === 'signature') {
      if (!activeSignature) {
        onRequestSignatureModal();
        return;
      }
      const newAnn: FormAnnotation = {
        id: uuidv4(),
        page: currentPage,
        type: 'signature',
        x: percentX,
        y: percentY,
        dataUrl: activeSignature,
        width: 22,
        height: 6,
      };
      onAddAnnotation(newAnn);
      setSelectedAnnId(newAnn.id);
    }
  };

  // Pointer Capture Dragging Logic
  const handlePointerDownAnn = (e: React.PointerEvent, ann: FormAnnotation) => {
    e.stopPropagation();
    setSelectedAnnId(ann.id);

    const target = e.target as HTMLElement;

    // If user clicked input directly (and not on drag handle), let them focus input unless tool === 'select'
    if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && activeTool !== 'select') {
      if (!target.closest('[data-drag-handle]')) {
        return;
      }
    }

    draggingId.current = ann.id;
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      annX: ann.x,
      annY: ann.y,
    };

    const elem = e.currentTarget as HTMLElement;
    try {
      elem.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMoveAnn = (e: React.PointerEvent) => {
    if (!draggingId.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    const deltaX = e.clientX - dragStartPos.current.mouseX;
    const deltaY = e.clientY - dragStartPos.current.mouseY;

    const deltaPercentX = (deltaX / rect.width) * 100;
    const deltaPercentY = (deltaY / rect.height) * 100;

    const newX = Math.max(0, Math.min(95, dragStartPos.current.annX + deltaPercentX));
    const newY = Math.max(0, Math.min(95, dragStartPos.current.annY + deltaPercentY));

    onUpdateAnnotation(draggingId.current, { x: newX, y: newY });
  };

  const handlePointerUpAnn = (e: React.PointerEvent) => {
    if (draggingId.current) {
      const elem = e.currentTarget as HTMLElement;
      try {
        if (elem.hasPointerCapture(e.pointerId)) {
          elem.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      draggingId.current = null;
    }
  };

  return (
    <div className="relative flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950/70 rounded-2xl overflow-auto border border-slate-200 dark:border-slate-800 min-h-[500px]">
      {/* Container wrapping canvas & overlay */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        style={{
          width: dimensions.width ? `${dimensions.width}px` : 'auto',
          height: dimensions.height ? `${dimensions.height}px` : 'auto',
          cursor:
            activeTool === 'select'
              ? 'default'
              : activeTool === 'text'
              ? 'text'
              : 'crosshair',
        }}
        className="relative bg-white shadow-xl rounded-md select-none transition-shadow hover:shadow-2xl"
      >
        {/* PDF Page Canvas */}
        <canvas ref={canvasRef} className="block w-full h-full pointer-events-none rounded-md" />

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xs flex flex-col items-center justify-center z-20">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Rendering Page {currentPage}...
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute inset-0 bg-rose-50/90 dark:bg-rose-950/90 flex flex-col items-center justify-center p-6 text-center z-20">
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">Failed to render page</p>
            <p className="text-xs text-rose-500">{error}</p>
          </div>
        )}

        {/* Annotations Layer */}
        {!isLoading && (
          <div className="absolute inset-0 overflow-hidden pointer-events-auto">
            {pageAnnotations.map((ann) => {
              const isSelected = selectedAnnId === ann.id;

              return (
                <div
                  key={ann.id}
                  data-annotation-element="true"
                  onPointerDown={(e) => handlePointerDownAnn(e, ann)}
                  onPointerMove={handlePointerMoveAnn}
                  onPointerUp={handlePointerUpAnn}
                  onPointerCancel={handlePointerUpAnn}
                  style={{
                    left: `${ann.x}%`,
                    top: `${ann.y}%`,
                  }}
                  className={`absolute transform -translate-x-1 -translate-y-1 transition-all group ${
                    isSelected ? 'z-30 ring-2 ring-indigo-500 rounded-lg bg-indigo-50/30' : 'z-10'
                  }`}
                >
                  {/* Dedicated Move Handle Bar & Controls when Selected */}
                  {isSelected && (
                    <div className="absolute bottom-full left-0 mb-1 flex items-center gap-1 p-1 bg-slate-900/95 text-white rounded-lg shadow-xl text-[10px] whitespace-nowrap z-40 animate-in fade-in">
                      {/* Move Drag Handle */}
                      <div
                        data-drag-handle="true"
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white cursor-grab active:cursor-grabbing"
                        title="Click and drag to move element anywhere"
                      >
                        <GripVertical className="w-3 h-3" />
                        <span className="font-semibold text-[10px]">Move</span>
                      </div>

                      {/* Font size adjustments */}
                      {(ann.type === 'text' || ann.type === 'date') && (
                        <div className="flex items-center gap-1 px-1.5 border-l border-r border-slate-700">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateAnnotation(ann.id, {
                                fontSize: Math.max(9, (ann.fontSize || 12) - 1),
                              });
                            }}
                            className="p-0.5 hover:bg-slate-800 rounded-sm"
                            title="Decrease font size"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="font-mono text-[9px] w-4 text-center">{ann.fontSize || 12}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateAnnotation(ann.id, {
                                fontSize: Math.min(36, (ann.fontSize || 12) + 1),
                              });
                            }}
                            className="p-0.5 hover:bg-slate-800 rounded-sm"
                            title="Increase font size"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      {/* Color buttons */}
                      <div className="flex items-center gap-1">
                        {['#0f172a', '#1e3a8a', '#dc2626', '#16a34a'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUpdateAnnotation(ann.id, { color: c });
                            }}
                            className="w-3 h-3 rounded-full border border-white/50"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteAnnotation(ann.id);
                        }}
                        className="p-1 text-rose-400 hover:text-rose-300 hover:bg-slate-800 rounded-sm ml-1"
                        title="Delete element"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Render Element Content */}
                  {ann.type === 'text' || ann.type === 'date' ? (
                    <div
                      className={`relative flex items-center px-1.5 py-0.5 border rounded-sm transition ${
                        isSelected
                          ? 'border-indigo-500 bg-white/95 shadow-sm'
                          : 'border-slate-300/60 bg-white/80 hover:border-indigo-400'
                      }`}
                    >
                      {/* Drag Handle Icon inside element box */}
                      <div
                        data-drag-handle="true"
                        className="cursor-grab active:cursor-grabbing mr-1 text-slate-400 hover:text-indigo-600"
                        title="Drag to move"
                      >
                        <GripVertical className="w-3 h-3" />
                      </div>

                      <input
                        type="text"
                        value={ann.text || ''}
                        onChange={(e) => onUpdateAnnotation(ann.id, { text: e.target.value })}
                        onFocus={() => setSelectedAnnId(ann.id)}
                        style={{
                          fontSize: `${ann.fontSize || 13}px`,
                          color: ann.color || '#0f172a',
                        }}
                        className="bg-transparent border-none outline-hidden min-w-[70px] font-sans"
                        placeholder="Click to type"
                      />
                    </div>
                  ) : ann.type === 'check' ? (
                    <div
                      data-drag-handle="true"
                      className={`flex items-center gap-1 p-1 rounded-sm border cursor-grab active:cursor-grabbing transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/80 shadow-sm'
                          : 'border-slate-300/60 bg-white/80 hover:border-indigo-400'
                      }`}
                      style={{ color: ann.color || '#16a34a' }}
                    >
                      <GripVertical className="w-3 h-3 text-slate-400" />
                      <Check className="w-5 h-5 stroke-[3]" />
                    </div>
                  ) : ann.type === 'cross' ? (
                    <div
                      data-drag-handle="true"
                      className={`flex items-center gap-1 p-1 rounded-sm border cursor-grab active:cursor-grabbing transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/80 shadow-sm'
                          : 'border-slate-300/60 bg-white/80 hover:border-indigo-400'
                      }`}
                      style={{ color: ann.color || '#dc2626' }}
                    >
                      <GripVertical className="w-3 h-3 text-slate-400" />
                      <X className="w-5 h-5 stroke-[3]" />
                    </div>
                  ) : ann.type === 'signature' && ann.dataUrl ? (
                    <div
                      data-drag-handle="true"
                      className={`flex items-center gap-1 p-1 rounded-sm border cursor-grab active:cursor-grabbing transition ${
                        isSelected
                          ? 'border-indigo-500 bg-white/95 shadow-md'
                          : 'border-dashed border-indigo-300 bg-white/80 hover:border-indigo-500'
                      }`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                      <img
                        src={ann.dataUrl}
                        alt="Signature"
                        className="max-h-12 w-auto object-contain pointer-events-none"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
