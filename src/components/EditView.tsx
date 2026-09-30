import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  RotateCw,
  RotateCcw,
  Trash2,
  Stamp,
  Hash,
  Undo2,
  Download,
  Eye,
  CheckSquare,
  Square,
  X,
  PenTool,
  Type,
  Check,
  Calendar,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Save,
  FileSignature,
  Layers,
  ChevronLeft,
  ChevronRight,
  MousePointer,
} from 'lucide-react';
import { usePdfStore } from '../store/pdfStore.ts';
import { DropZone } from './DropZone.tsx';
import { PageThumbnail } from './PageThumbnail.tsx';
import { FormPageCanvas } from './FormPageCanvas.tsx';
import { SignatureModal } from './SignatureModal.tsx';
import { AcroFormFieldsPanel } from './AcroFormFieldsPanel.tsx';
import { pdfApi } from '../services/api.ts';
import { clearPdfDocCache } from '../services/pdfRenderer.ts';
import toast from 'react-hot-toast';
import type {
  EditOperation,
  StoredDocumentMeta,
  FormFieldMeta,
  FormAnnotation,
  AnnotationType,
} from '../types/pdf.ts';

export const EditView: React.FC = () => {
  const {
    editFile,
    setEditFile,
    applyEditUpdate,
    undoStack,
    pushUndo,
    popUndo,
    selectedEditPages,
    toggleEditPage,
    selectAllEditPages,
    clearEditPages,
    isEditing,
    setEditing,
    resetEdit,
    openPreview,
  } = usePdfStore();

  const [activeTab, setActiveTab] = useState<'form' | 'pages'>('form');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Form Filling & Annotation Tools
  const [activeTool, setActiveTool] = useState<'select' | AnnotationType>('text');
  const [annotations, setAnnotations] = useState<FormAnnotation[]>([]);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [activeSignature, setActiveSignature] = useState<string | undefined>(undefined);
  const [flattenPdf, setFlattenPdf] = useState(false);

  // AcroForm fields
  const [acroFields, setAcroFields] = useState<FormFieldMeta[]>([]);
  const [acroValues, setAcroValues] = useState<Record<string, string | boolean>>({});
  const [showFieldsDrawer, setShowFieldsDrawer] = useState(true);
  const [isInspectingForm, setIsInspectingForm] = useState(false);

  // Watermark modal state
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkSize, setWatermarkSize] = useState(48);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25);
  const [watermarkColor, setWatermarkColor] = useState('#dc2626');
  const [watermarkRotation, setWatermarkRotation] = useState(45);

  // Page Numbers modal state
  const [showPageNumbersModal, setShowPageNumbersModal] = useState(false);
  const [pageNumberStartAt, setPageNumberStartAt] = useState(1);
  const [pageNumberFontSize, setPageNumberFontSize] = useState(10);

  const pagesArray = useMemo(() => {
    if (!editFile) return [];
    return Array.from({ length: editFile.pageCount }, (_, i) => i + 1);
  }, [editFile]);

  // Inspect form fields whenever a new document is loaded
  useEffect(() => {
    if (!editFile?.id) {
      setAcroFields([]);
      setAcroValues({});
      setAnnotations([]);
      setCurrentPage(1);
      return;
    }

    let isMounted = true;
    const inspect = async () => {
      try {
        setIsInspectingForm(true);
        const res = await pdfApi.inspectForm(editFile.id);
        if (isMounted) {
          setAcroFields(res.fields || []);
          const initialVals: Record<string, string | boolean> = {};
          res.fields.forEach((f) => {
            initialVals[f.name] = f.value;
          });
          setAcroValues(initialVals);
          // If the document has form fields, open the fields panel automatically
          if (res.fields.length > 0) {
            setShowFieldsDrawer(true);
          }
        }
      } catch (err) {
        console.warn('Could not inspect form fields:', err);
      } finally {
        if (isMounted) {
          setIsInspectingForm(false);
        }
      }
    };

    inspect();
    return () => {
      isMounted = false;
    };
  }, [editFile?.id]);

  // Execute standard page operations on backend (rotate, delete, watermark, page numbers)
  const executeOperation = async (operations: EditOperation[], actionLabel: string) => {
    if (!editFile) return;

    try {
      setEditing(true);
      setSessionExpired(false);
      const prevDoc = { ...editFile };

      const res = await pdfApi.editPdf(editFile.id, operations);

      // Save previous document to undo stack ONLY after success
      pushUndo(prevDoc);

      // Invalidate cache for both old and new documents
      clearPdfDocCache(prevDoc.id);
      clearPdfDocCache(res.documentId);

      const updatedDoc: StoredDocumentMeta = {
        id: res.documentId,
        originalName: res.originalName,
        pageCount: res.pageCount,
        sizeBytes: res.sizeBytes || prevDoc.sizeBytes,
      };

      applyEditUpdate(updatedDoc);
      clearEditPages();

      // Ensure currentPage stays within valid bounds
      if (currentPage > res.pageCount) {
        setCurrentPage(Math.max(1, res.pageCount));
      }

      toast.success(`${actionLabel} applied successfully!`);
    } catch (err: any) {
      console.error('Edit error:', err);
      if (
        err.code === 'DOCUMENT_NOT_FOUND' ||
        err.statusCode === 404 ||
        err.message?.includes('expired') ||
        err.message?.includes('not found')
      ) {
        setSessionExpired(true);
        toast.error('Document session expired on the server. Please reload or upload a new file.');
      } else {
        toast.error(err.message || `Failed to apply ${actionLabel}`);
      }
    } finally {
      setEditing(false);
    }
  };

  // Save & Burn Filled Form (AcroForm values + Placed Annotations)
  const handleSaveFilledForm = async () => {
    if (!editFile) return;

    const hasAnnotations = annotations.length > 0;
    const hasFieldChanges = Object.keys(acroValues).length > 0;

    if (!hasAnnotations && !hasFieldChanges) {
      toast('No form annotations or fields to save yet. You can download the current PDF directly.');
      return;
    }

    try {
      setEditing(true);
      setSessionExpired(false);
      const prevDoc = { ...editFile };

      const res = await pdfApi.fillForm({
        fileId: editFile.id,
        acroFieldValues: acroValues,
        annotations,
        flatten: flattenPdf,
      });

      pushUndo(prevDoc);

      clearPdfDocCache(prevDoc.id);
      clearPdfDocCache(res.documentId);

      const updatedDoc: StoredDocumentMeta = {
        id: res.documentId,
        originalName: res.originalName,
        pageCount: res.pageCount,
        sizeBytes: res.sizeBytes || prevDoc.sizeBytes,
      };

      applyEditUpdate(updatedDoc);
      // Clear annotations since they are now permanently baked into the document
      setAnnotations([]);
      toast.success('Form filled & changes saved to document!');
    } catch (err: any) {
      console.error('Fill form error:', err);
      if (
        err.code === 'DOCUMENT_NOT_FOUND' ||
        err.statusCode === 404 ||
        err.message?.includes('expired') ||
        err.message?.includes('not found')
      ) {
        setSessionExpired(true);
        toast.error('Document session expired on the server. Please reload or upload a new file.');
      } else {
        toast.error(err.message || 'Failed to save filled form');
      }
    } finally {
      setEditing(false);
    }
  };

  // 1. Rotate
  const handleRotate = (degrees: 90 | -90) => {
    if (!editFile) return;
    const pagesToRotate = selectedEditPages.length > 0 ? selectedEditPages : pagesArray;
    const op: EditOperation = {
      type: 'rotate',
      pages: pagesToRotate,
      degrees,
    };
    executeOperation(
      [op],
      `Rotate ${pagesToRotate.length} page(s) by ${degrees > 0 ? '90° CW' : '90° CCW'}`
    );
  };

  // 2. Delete
  const handleDeleteSelected = () => {
    if (!editFile) return;
    if (selectedEditPages.length === 0) {
      toast.error('Please select at least one page to delete.');
      return;
    }
    if (selectedEditPages.length >= editFile.pageCount) {
      toast.error('Cannot delete all pages of the document.');
      return;
    }

    const op: EditOperation = {
      type: 'delete',
      pages: selectedEditPages,
    };
    executeOperation([op], `Delete ${selectedEditPages.length} page(s)`);
  };

  // 3. Watermark
  const handleApplyWatermark = () => {
    if (!editFile) return;
    if (!watermarkText.trim()) {
      toast.error('Please enter watermark text.');
      return;
    }

    const op: EditOperation = {
      type: 'watermark',
      text: watermarkText.trim(),
      fontSize: watermarkSize,
      opacity: watermarkOpacity,
      color: watermarkColor,
      rotation: watermarkRotation,
    };

    setShowWatermarkModal(false);
    executeOperation([op], `Add watermark "${watermarkText}"`);
  };

  // 4. Page Numbers
  const handleApplyPageNumbers = () => {
    if (!editFile) return;

    const op: EditOperation = {
      type: 'pageNumbers',
      startAt: pageNumberStartAt,
      fontSize: pageNumberFontSize,
    };

    setShowPageNumbersModal(false);
    executeOperation([op], `Add page numbers`);
  };

  // 5. Undo
  const handleUndo = () => {
    const restored = popUndo();
    if (restored) {
      clearPdfDocCache(restored.id);
      toast.success('Restored previous document state.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Session Expired Banner if document lost on server restart */}
      {sessionExpired && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div>
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
              Document Session Expired
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
              The in-memory file session has expired. Please re-upload your PDF document to continue editing.
            </p>
          </div>
          <button
            onClick={() => {
              setSessionExpired(false);
              resetEdit();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
          >
            Re-upload PDF
          </button>
        </div>
      )}

      {/* Upload Drop Zone if no file loaded */}
      {!editFile ? (
        <DropZone
          multiple={false}
          title="Upload a PDF to Fill & Edit"
          subtitle="Type anywhere, stamp checkmarks, insert digital signatures, fill PDF forms, or rearrange sheets"
          onFilesUploaded={(files) => files[0] && setEditFile(files[0])}
        />
      ) : (
        /* Document Header Info Bar */
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileSignature className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate max-w-[280px] sm:max-w-md">
                  {editFile.originalName}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                  {editFile.pageCount} {editFile.pageCount === 1 ? 'page' : 'pages'}
                </span>
                {acroFields.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800/60">
                    {acroFields.length} Form Fields
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Page {currentPage} of {editFile.pageCount}</span>
                {annotations.length > 0 && (
                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                    • {annotations.length} annotation{annotations.length > 1 ? 's' : ''} placed
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0 || isEditing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 transition"
              title="Undo last action"
            >
              <Undo2 className="w-3.5 h-3.5" /> Undo ({undoStack.length})
            </button>

            {/* Preview */}
            <button
              onClick={() => openPreview(editFile.id, editFile.originalName, currentPage, editFile.pageCount)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>

            {/* Save & Apply */}
            <button
              onClick={handleSaveFilledForm}
              disabled={isEditing || (annotations.length === 0 && Object.keys(acroValues).length === 0)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs disabled:opacity-50 transition"
              title="Burn annotations & save field values into the PDF document"
            >
              <Save className="w-3.5 h-3.5" /> Save Changes
            </button>

            {/* Download */}
            <a
              href={`/api/pdf/${editFile.id}/download`}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>

            {/* Close */}
            <button
              onClick={resetEdit}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
              title="Close document"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Edit Suite Content */}
      {editFile && (
        <div className="space-y-4">
          {/* Main Mode Tab Selector */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('form')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'form'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <FileSignature className="w-4 h-4" /> Fill Form & Sign
              </button>
              <button
                onClick={() => setActiveTab('pages')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                  activeTab === 'pages'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Layers className="w-4 h-4" /> Page Operations ({editFile.pageCount})
              </button>
            </div>

            {/* Zoom Controls */}
            {activeTab === 'form' && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1 shadow-2xs">
                <button
                  onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-sm"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))))}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-sm"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoom(1.0)}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-sm ml-1"
                  title="Reset Zoom"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: FILL FORM & SIGN */}
          {activeTab === 'form' && (
            <div className="space-y-4">
              {/* Form Toolbar */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-400 mr-1 hidden sm:inline">Tools:</span>

                  {/* Select */}
                  <button
                    onClick={() => setActiveTool('select')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      activeTool === 'select'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <MousePointer className="w-3.5 h-3.5" /> Select / Move
                  </button>

                  {/* Add Text */}
                  <button
                    onClick={() => setActiveTool('text')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      activeTool === 'text'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5 text-indigo-400" /> Type Text
                  </button>

                  {/* Checkmark */}
                  <button
                    onClick={() => setActiveTool('check')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      activeTool === 'check'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-500" /> Checkmark (✓)
                  </button>

                  {/* Cross */}
                  <button
                    onClick={() => setActiveTool('cross')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      activeTool === 'cross'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <X className="w-3.5 h-3.5 text-rose-500" /> Cross (✗)
                  </button>

                  {/* Date */}
                  <button
                    onClick={() => setActiveTool('date')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      activeTool === 'date'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" /> Date
                  </button>

                  {/* Signature */}
                  <button
                    onClick={() => {
                      if (!activeSignature) {
                        setShowSignatureModal(true);
                      } else {
                        setActiveTool('signature');
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      activeTool === 'signature'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5 text-amber-500" />{' '}
                    {activeSignature ? 'Stamp Signature' : 'Create Signature'}
                  </button>

                  {activeSignature && (
                    <button
                      onClick={() => setShowSignatureModal(true)}
                      className="text-[11px] text-indigo-600 hover:underline px-1 font-medium"
                    >
                      Change
                    </button>
                  )}
                </div>

                {/* Right: Toggle Form Fields drawer */}
                <div className="flex items-center gap-2">
                  {acroFields.length > 0 && (
                    <button
                      onClick={() => setShowFieldsDrawer((d) => !d)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        showFieldsDrawer
                          ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                          : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {showFieldsDrawer ? (
                        <>
                          <PanelRightClose className="w-3.5 h-3.5" /> Hide Fields ({acroFields.length})
                        </>
                      ) : (
                        <>
                          <PanelRightOpen className="w-3.5 h-3.5" /> Show Fields ({acroFields.length})
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Workspace Layout: Page Selector + Canvas + Optional Drawer */}
              <div className="flex gap-4 items-start">
                {/* Left Mini Page Selector */}
                {editFile.pageCount > 1 && (
                  <div className="w-24 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 max-h-[600px] overflow-y-auto space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block text-center mb-1">
                      Pages
                    </span>
                    {pagesArray.map((p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-full p-1.5 rounded-xl text-center border transition ${
                          currentPage === p
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-xs">Page {p}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Center Live Interactive Canvas */}
                <div className="flex-1 min-w-0">
                  {/* Page Navigation Bar */}
                  {editFile.pageCount > 1 && (
                    <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 mb-3">
                      <button
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:text-indigo-600"
                      >
                        <ChevronLeft className="w-4 h-4" /> Previous Page
                      </button>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Page {currentPage} of {editFile.pageCount}
                      </span>
                      <button
                        disabled={currentPage >= editFile.pageCount}
                        onClick={() => setCurrentPage((p) => Math.min(editFile.pageCount, p + 1))}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:text-indigo-600"
                      >
                        Next Page <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <FormPageCanvas
                    documentId={editFile.id}
                    currentPage={currentPage}
                    zoom={zoom}
                    activeTool={activeTool}
                    activeSignature={activeSignature}
                    annotations={annotations}
                    onAddAnnotation={(ann) => setAnnotations((prev) => [...prev, ann])}
                    onUpdateAnnotation={(id, updates) =>
                      setAnnotations((prev) =>
                        prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
                      )
                    }
                    onDeleteAnnotation={(id) =>
                      setAnnotations((prev) => prev.filter((a) => a.id !== id))
                    }
                    onRequestSignatureModal={() => setShowSignatureModal(true)}
                  />

                  {/* Quick Tip Bar */}
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-2">
                    💡 Click anywhere on the page above to stamp {activeTool}. Drag to reposition, or select an element to adjust font size and color.
                  </p>
                </div>

                {/* Right Side Drawer: Interactive AcroForm Fields */}
                {acroFields.length > 0 && showFieldsDrawer && (
                  <div className="w-80 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs animate-in slide-in-from-right-4 duration-200">
                    <AcroFormFieldsPanel
                      fields={acroFields}
                      values={acroValues}
                      onChange={(name, val) =>
                        setAcroValues((prev) => ({ ...prev, [name]: val }))
                      }
                      onClear={() => setAcroValues({})}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PAGE OPERATIONS (Rotate, Delete, Watermark, Page numbers) */}
          {activeTab === 'pages' && (
            <div className="space-y-4">
              {/* Operations Toolbar */}
              <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllEditPages}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-500" /> Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearEditPages}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  >
                    <Square className="w-3.5 h-3.5" /> Deselect
                  </button>

                  <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

                  {/* Rotate CCW */}
                  <button
                    type="button"
                    onClick={() => handleRotate(-90)}
                    disabled={isEditing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Rotate -90°
                  </button>

                  {/* Rotate CW */}
                  <button
                    type="button"
                    onClick={() => handleRotate(90)}
                    disabled={isEditing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 transition"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Rotate +90°
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Delete Pages */}
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={isEditing || selectedEditPages.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 disabled:opacity-40 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedEditPages.length})
                  </button>

                  {/* Watermark modal trigger */}
                  <button
                    type="button"
                    onClick={() => setShowWatermarkModal(true)}
                    disabled={isEditing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    <Stamp className="w-3.5 h-3.5 text-amber-500" /> Watermark
                  </button>

                  {/* Page Numbers modal trigger */}
                  <button
                    type="button"
                    onClick={() => setShowPageNumbersModal(true)}
                    disabled={isEditing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    <Hash className="w-3.5 h-3.5 text-blue-500" /> Page Numbers
                  </button>
                </div>
              </div>

              {/* Multi-page Thumbnail Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {pagesArray.map((pageNum) => (
                  <PageThumbnail
                    key={`${editFile.id}_p${pageNum}`}
                    documentId={editFile.id}
                    pageNum={pageNum}
                    showCheckbox={true}
                    isSelected={selectedEditPages.includes(pageNum)}
                    onToggleSelect={toggleEditPage}
                    onClickPreview={() =>
                      openPreview(editFile.id, editFile.originalName, pageNum, editFile.pageCount)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sticky Bottom Form Save Bar */}
          <div className="sticky bottom-4 z-30 p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={flattenPdf}
                  onChange={(e) => setFlattenPdf(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
                />
                <span>Flatten PDF form (locks fields & signatures so they cannot be altered)</span>
              </label>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleSaveFilledForm}
                disabled={isEditing || (annotations.length === 0 && Object.keys(acroValues).length === 0)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-md transition"
              >
                <Save className="w-4 h-4" /> Save & Burn Changes
              </button>
              <a
                href={`/api/pdf/${editFile.id}/download`}
                download
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-sm transition"
              >
                <Download className="w-4 h-4" /> Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Signature Creation Modal */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSaveSignature={(dataUrl) => {
          setActiveSignature(dataUrl);
          setActiveTool('signature');
          toast.success('Signature adopted! Click anywhere on the document to place it.');
        }}
      />

      {/* Watermark Modal */}
      {showWatermarkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Stamp className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-slate-900 dark:text-white">Add Watermark</h3>
              </div>
              <button
                onClick={() => setShowWatermarkModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Watermark Text
              </label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="e.g. CONFIDENTIAL, DRAFT, SAMPLE"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Font Size ({watermarkSize}px)
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={watermarkSize}
                  onChange={(e) => setWatermarkSize(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Opacity ({Math.round(watermarkOpacity * 100)}%)
                </label>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={watermarkColor}
                  onChange={(e) => setWatermarkColor(e.target.value)}
                  className="w-full h-9 rounded-lg cursor-pointer bg-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Rotation Angle ({watermarkRotation}°)
                </label>
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="15"
                  value={watermarkRotation}
                  onChange={(e) => setWatermarkRotation(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowWatermarkModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyWatermark}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
              >
                Apply Watermark
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Numbers Modal */}
      {showPageNumbersModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-slate-900 dark:text-white">Add Page Numbers</h3>
              </div>
              <button
                onClick={() => setShowPageNumbersModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Numbering At
              </label>
              <input
                type="number"
                min="1"
                value={pageNumberStartAt}
                onChange={(e) => setPageNumberStartAt(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Font Size ({pageNumberFontSize}pt)
              </label>
              <input
                type="range"
                min="8"
                max="20"
                value={pageNumberFontSize}
                onChange={(e) => setPageNumberFontSize(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Numbers will be cleanly stamped at bottom-center of every page as &quot;Page X of Y&quot;.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowPageNumbersModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyPageNumbers}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
              >
                Apply Numbers
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
