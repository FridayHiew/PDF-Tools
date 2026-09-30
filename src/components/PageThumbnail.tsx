import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Eye, Check } from 'lucide-react';
import { renderPageThumbnail } from '../services/pdfRenderer.ts';

interface PageThumbnailProps {
  documentId: string;
  pageNum: number;
  isSelected?: boolean;
  onToggleSelect?: (pageNum: number) => void;
  onClickPreview?: (pageNum: number) => void;
  scale?: number;
  rotation?: number;
  showCheckbox?: boolean;
  badgeText?: string;
  className?: string;
}

export const PageThumbnail: React.FC<PageThumbnailProps> = ({
  documentId,
  pageNum,
  isSelected = false,
  onToggleSelect,
  onClickPreview,
  scale = 0.35,
  rotation = 0,
  showCheckbox = false,
  badgeText,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  // Lazy render when in or near viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !documentId) return;

    let isMounted = true;
    const viewUrl = `/api/pdf/${documentId}/view`;

    const loadThumb = async () => {
      try {
        setIsLoading(true);
        setHasError(false);
        const url = await renderPageThumbnail(viewUrl, pageNum, scale, documentId);
        if (isMounted) {
          setDataUrl(url);
        }
      } catch (err) {
        if (isMounted) {
          console.warn(`Could not render thumbnail for p.${pageNum}`, err);
          setHasError(true);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadThumb();

    return () => {
      isMounted = false;
    };
  }, [isVisible, documentId, pageNum, scale]);

  const handleContainerClick = (e: React.MouseEvent) => {
    // If clicking on checkbox or if selectable
    if (showCheckbox && onToggleSelect) {
      onToggleSelect(pageNum);
    } else if (onClickPreview) {
      onClickPreview(pageNum);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`group relative flex flex-col items-center justify-between p-2 rounded-xl border transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 hover:shadow-xs'
      } ${className}`}
    >
      {/* Top Bar: Checkbox & Badge */}
      <div className="w-full flex items-center justify-between gap-1 mb-1.5 z-10">
        <div className="flex items-center gap-1.5">
          {showCheckbox && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(pageNum);
              }}
              className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                isSelected
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-indigo-400'
              }`}
            >
              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
            </div>
          )}
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            {badgeText || `Page ${pageNum}`}
          </span>
        </div>

        {onClickPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClickPreview(pageNum);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 transition"
            title="Preview full page"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Thumbnail Frame */}
      <div className="w-full aspect-[1/1.29] relative flex items-center justify-center bg-slate-100 dark:bg-slate-800/60 rounded-lg overflow-hidden border border-slate-200/60 dark:border-slate-800">
        {isLoading && (
          <div className="flex flex-col items-center justify-center text-slate-400 gap-1.5">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span className="text-[10px]">Loading...</span>
          </div>
        )}

        {hasError && !isLoading && (
          <div className="text-center p-2 text-rose-500 text-[10px]">
            Preview unavailable
          </div>
        )}

        {dataUrl && !isLoading && (
          <img
            src={dataUrl}
            alt={`Page ${pageNum}`}
            style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
            className="w-full h-full object-contain pointer-events-none transition-transform duration-200"
          />
        )}

        {/* Hover quick preview button overlay */}
        {onClickPreview && (
          <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="px-2 py-1 rounded-md bg-white/90 dark:bg-slate-900/90 text-[11px] font-medium text-slate-800 dark:text-slate-200 shadow-xs flex items-center gap-1">
              <Eye className="w-3 h-3" /> View
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
