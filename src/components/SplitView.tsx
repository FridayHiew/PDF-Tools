import React, { useMemo, useState } from 'react';
import {
  Scissors,
  Download,
  Eye,
  CheckSquare,
  Square,
  FileText,
  Layers,
  ArrowRight,
  ListFilter,
  Repeat,
  CheckCircle2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { usePdfStore } from '../store/pdfStore.ts';
import { DropZone } from './DropZone.tsx';
import { PageThumbnail } from './PageThumbnail.tsx';
import { pdfApi } from '../services/api.ts';
import toast from 'react-hot-toast';

export const SplitView: React.FC = () => {
  const {
    splitFile,
    setSplitFile,
    splitMode,
    setSplitMode,
    rangeInput,
    setRangeInput,
    everyInput,
    setEveryInput,
    selectedSplitPages,
    toggleSplitPage,
    selectAllSplitPages,
    clearSplitPages,
    isSplitting,
    setSplitting,
    splitResults,
    setSplitResults,
    openPreview,
    resetSplit,
  } = usePdfStore();

  const [sessionExpired, setSessionExpired] = useState(false);

  const pagesArray = useMemo(() => {
    if (!splitFile) return [];
    return Array.from({ length: splitFile.pageCount }, (_, i) => i + 1);
  }, [splitFile]);

  const handleSplit = async () => {
    if (!splitFile) {
      toast.error('Please upload a PDF file first.');
      return;
    }

    try {
      setSplitting(true);
      setSessionExpired(false);
      const params: any = {
        fileId: splitFile.id,
        mode: splitMode,
      };

      if (splitMode === 'range') {
        if (!rangeInput.trim()) {
          toast.error('Please enter valid page ranges (e.g. 1-3, 4).');
          setSplitting(false);
          return;
        }
        params.ranges = rangeInput;
      } else if (splitMode === 'every') {
        if (!everyInput || everyInput < 1) {
          toast.error('Please enter a valid number of pages per chunk.');
          setSplitting(false);
          return;
        }
        params.every = everyInput;
      } else if (splitMode === 'extract') {
        if (selectedSplitPages.length === 0) {
          toast.error('Please select at least one page to extract.');
          setSplitting(false);
          return;
        }
        params.pages = selectedSplitPages;
      }

      const res = await pdfApi.splitPdf(params);
      setSplitResults(res.parts);
      toast.success(`Split completed! Created ${res.parts.length} PDF files.`);
    } catch (err: any) {
      console.error('Split error:', err);
      if (
        err.code === 'DOCUMENT_NOT_FOUND' ||
        err.statusCode === 404 ||
        err.message?.includes('expired') ||
        err.message?.includes('not found') ||
        err.message?.includes('Failed to fetch')
      ) {
        setSessionExpired(true);
        toast.error('The document session has expired. Please re-upload your PDF file.');
      } else {
        toast.error(err.message || 'Failed to split PDF');
      }
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Session Expired Banner */}
      {sessionExpired && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div>
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
              Document Session Expired
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-0.5">
              The in-memory file is no longer available on the server. Please re-upload your PDF to continue splitting.
            </p>
          </div>
          <button
            onClick={() => {
              setSessionExpired(false);
              resetSplit();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-upload PDF
          </button>
        </div>
      )}

      {/* Upload Drop Zone if no file loaded */}
      {!splitFile ? (
        <DropZone
          multiple={false}
          title="Upload a PDF to split"
          subtitle="Extract pages, split by custom ranges, or chunk into equal parts"
          onFilesUploaded={(files) => files[0] && setSplitFile(files[0])}
        />
      ) : (
        /* Document Header Info Bar */
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  {splitFile.originalName}
                </h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                  {splitFile.pageCount} pages
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {(splitFile.sizeBytes / 1024).toFixed(1)} KB • In-Memory Document
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => openPreview(splitFile.id, splitFile.originalName, 1, splitFile.pageCount)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            >
              <Eye className="w-3.5 h-3.5" /> Preview PDF
            </button>
            <button
              onClick={resetSplit}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Change File
            </button>
          </div>
        </div>
      )}

      {/* Split Mode Selector & Configuration */}
      {splitFile && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Split Method
            </span>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSplitMode('range')}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition ${
                splitMode === 'range'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <ListFilter className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  By Page Range
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  e.g. "1-3, 5, 7-10" into individual PDF files
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSplitMode('every')}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition ${
                splitMode === 'every'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <Repeat className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Every N Pages
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Chunk into equal parts of N pages each
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSplitMode('extract')}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition ${
                splitMode === 'extract'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <CheckSquare className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Extract Selected
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Pick specific pages into a single PDF
                </p>
              </div>
            </button>
          </div>

          {/* Mode Inputs */}
          <div className="pt-2">
            {splitMode === 'range' && (
              <div className="space-y-1.5 max-w-md">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Page Ranges (comma-separated):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="e.g. 1-2, 3, 4-5"
                    className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const half = Math.max(1, Math.floor(splitFile.pageCount / 2));
                      setRangeInput(`1-${half}, ${half + 1}-${splitFile.pageCount}`);
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    Halve PDF
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Total document pages: 1 to {splitFile.pageCount}. Each range creates a separate PDF download.
                </p>
              </div>
            )}

            {splitMode === 'every' && (
              <div className="space-y-1.5 max-w-xs">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Number of pages per split:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={splitFile.pageCount}
                    value={everyInput}
                    onChange={(e) => setEveryInput(parseInt(e.target.value, 10) || 1)}
                    className="w-24 px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-500">
                    Will yield ~{Math.ceil(splitFile.pageCount / (everyInput || 1))} output files
                  </span>
                </div>
              </div>
            )}

            {splitMode === 'extract' && (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {selectedSplitPages.length}
                  </span>{' '}
                  of {splitFile.pageCount} pages selected
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllSplitPages}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-500" /> Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearSplitPages}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                  >
                    <Square className="w-3.5 h-3.5" /> Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Split Output Results */}
      {splitResults.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Generated Split Files ({splitResults.length})
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {splitResults.map((part, i) => (
              <div
                key={part.documentId || i}
                className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shadow-xs hover:border-indigo-300 transition"
              >
                <div className="truncate">
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                    {part.label}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {part.pageCount} {part.pageCount === 1 ? 'page' : 'pages'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openPreview(part.documentId, part.label, 1, part.pageCount)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="Preview part"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <a
                    href={part.downloadUrl}
                    download
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Virtualized/Responsive Thumbnail Grid of All Pages */}
      {splitFile && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              All Document Pages ({splitFile.pageCount})
            </h4>
            <span className="text-xs text-slate-500">
              {splitMode === 'extract'
                ? 'Click cards to toggle selection for extraction'
                : 'Click any thumbnail to preview'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {pagesArray.map((pageNum) => (
              <PageThumbnail
                key={pageNum}
                documentId={splitFile.id}
                pageNum={pageNum}
                showCheckbox={splitMode === 'extract'}
                isSelected={selectedSplitPages.includes(pageNum)}
                onToggleSelect={toggleSplitPage}
                onClickPreview={() => openPreview(splitFile.id, splitFile.originalName, pageNum, splitFile.pageCount)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      {splitFile && (
        <div className="sticky bottom-4 z-30 p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-xl backdrop-blur-md flex items-center justify-between gap-4">
          <div className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
            {splitMode === 'range' && `Split into ranges: ${rangeInput || 'not set'}`}
            {splitMode === 'every' && `Split every ${everyInput} page(s)`}
            {splitMode === 'extract' && `Extract ${selectedSplitPages.length} selected page(s)`}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetSplit}
              disabled={isSplitting}
              className="px-3 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSplit}
              disabled={isSplitting || (splitMode === 'extract' && selectedSplitPages.length === 0)}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white shadow-md shadow-indigo-600/20 transition disabled:cursor-not-allowed"
            >
              {isSplitting ? (
                <>Splitting...</>
              ) : (
                <>
                  <span>Execute Split</span>
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
