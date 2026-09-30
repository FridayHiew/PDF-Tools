import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Download,
  Eye,
  FileStack,
  CheckCircle2,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { usePdfStore, MergeItem } from '../store/pdfStore.ts';
import { DropZone } from './DropZone.tsx';
import { PageThumbnail } from './PageThumbnail.tsx';
import { pdfApi } from '../services/api.ts';
import toast from 'react-hot-toast';

interface SortableFileCardProps {
  item: MergeItem;
  index: number;
  total: number;
  onRemove: (id: string) => void;
  onPreview: (id: string, name: string, pageCount: number) => void;
}

const SortableFileCard: React.FC<SortableFileCardProps> = ({
  item,
  index,
  onRemove,
  onPreview,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col p-3 rounded-2xl border transition-all ${
        isDragging
          ? 'opacity-60 ring-2 ring-indigo-500 shadow-xl bg-indigo-50 dark:bg-slate-800'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
      }`}
    >
      {/* Top Header: Order & Drag Handle */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
          <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[11px] text-slate-700 dark:text-slate-300 font-mono">
            {index + 1}
          </span>
          <span className="truncate max-w-[120px] font-medium text-slate-700 dark:text-slate-300">
            {item.originalName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition"
            title="Remove file"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Page 1 Thumbnail */}
      <div className="flex-1 my-1">
        <PageThumbnail
          documentId={item.id}
          pageNum={1}
          badgeText="Page 1"
          onClickPreview={() => onPreview(item.id, item.originalName, item.pageCount)}
        />
      </div>

      {/* Footer Info */}
      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
        </span>
        <span className="font-mono text-[11px]">{formatBytes(item.sizeBytes)}</span>
      </div>
    </div>
  );
};

export const MergeView: React.FC = () => {
  const {
    mergeFiles,
    addMergeFiles,
    removeMergeFile,
    reorderMergeFiles,
    clearMergeFiles,
    isMerging,
    setMerging,
    mergedResult,
    setMergedResult,
    openPreview,
  } = usePdfStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = mergeFiles.findIndex((item) => item.id === active.id);
      const newIndex = mergeFiles.findIndex((item) => item.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderMergeFiles(oldIndex, newIndex);
      }
    }
  };

  const handleMerge = async () => {
    if (mergeFiles.length < 2) {
      toast.error('Please upload at least 2 PDF files to merge.');
      return;
    }

    try {
      setMerging(true);
      const fileIds = mergeFiles.map((f) => f.id);
      const result = await pdfApi.mergeFiles(fileIds);
      setMergedResult(result);
      toast.success(`Successfully merged ${mergeFiles.length} files into ${result.pageCount} pages!`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to merge PDF files');
    } finally {
      setMerging(false);
    }
  };

  const totalPages = mergeFiles.reduce((acc, f) => acc + f.pageCount, 0);

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <DropZone
        multiple
        title="Upload 2 or more PDFs to merge"
        subtitle="Combine contracts, reports, or chapters into a single orderly document"
        onFilesUploaded={(files) => addMergeFiles(files)}
      />

      {/* Merged Success Banner */}
      {mergedResult && (
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-100">
                PDFs Merged Successfully!
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Combined document contains {mergedResult.pageCount} pages ready for download.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => openPreview(mergedResult.documentId, mergedResult.originalName, 1, mergedResult.pageCount)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition"
            >
              <Eye className="w-4 h-4 text-indigo-500" /> Preview Result
            </button>
            <a
              href={mergedResult.downloadUrl}
              download
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
            >
              <Download className="w-4 h-4" /> Download Merged PDF
            </a>
          </div>
        </div>
      )}

      {/* Merge Queue Header */}
      {mergeFiles.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileStack className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Files to Merge ({mergeFiles.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Drag cards to reorder sequence. Total resulting document: {totalPages} pages.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearMergeFiles}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Dnd Sortable Grid */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={mergeFiles.map((f) => f.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {mergeFiles.map((file, index) => (
                  <SortableFileCard
                    key={file.id}
                    item={file}
                    index={index}
                    total={mergeFiles.length}
                    onRemove={removeMergeFile}
                    onPreview={(id, name, count) => openPreview(id, name, 1, count)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : (
        <div className="py-12 px-4 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
            No files queued for merge
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Upload two or more PDF files using the box above to combine them into a single document.
          </p>
        </div>
      )}

      {/* Sticky Bottom Action Bar for Merge */}
      {mergeFiles.length > 0 && (
        <div className="sticky bottom-4 z-30 p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-xl backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
              Ready to merge {mergeFiles.length} files
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              ({totalPages} total pages)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={clearMergeFiles}
              disabled={isMerging}
              className="px-3 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleMerge}
              disabled={isMerging || mergeFiles.length < 2}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white shadow-md shadow-indigo-600/20 transition disabled:cursor-not-allowed"
            >
              {isMerging ? (
                <>Processing...</>
              ) : (
                <>
                  <span>Merge {mergeFiles.length} PDFs</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
