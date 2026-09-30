import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { pdfApi } from '../services/api.ts';
import type { StoredDocumentMeta } from '../types/pdf.ts';

interface DropZoneProps {
  multiple?: boolean;
  onFilesUploaded: (files: StoredDocumentMeta[]) => void;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  multiple = false,
  onFilesUploaded,
  title = 'Upload PDF file',
  subtitle = 'Drag and drop your file here, or click to browse',
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    // Validate type and size
    const validFiles: File[] = [];
    for (const f of rawFiles) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        toast.error(`"${f.name}" is not a PDF. Only PDF files are supported.`);
        continue;
      }
      if (f.size > 200 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds the 200MB limit.`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length === 0) return;

    const filesToSend = multiple ? validFiles : [validFiles[0]];

    try {
      setIsUploading(true);
      const uploaded = await pdfApi.uploadFiles(filesToSend);
      toast.success(
        uploaded.length === 1
          ? `Uploaded "${uploaded[0].originalName}" (${uploaded[0].pageCount} pages)`
          : `Uploaded ${uploaded.length} PDF files successfully`
      );
      onFilesUploaded(uploaded);
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload PDF files');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-all duration-200 select-none ${
        isDragging
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 scale-[1.005]'
          : 'border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:border-indigo-400 hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
      } ${isUploading ? 'pointer-events-none opacity-80' : ''} ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files && processFiles(e.target.files)}
      />

      <div className="flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center ring-8 ring-indigo-50/50 dark:ring-indigo-950/30 transition group-hover:scale-105">
          {isUploading ? (
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600 dark:text-indigo-400" />
          ) : (
            <UploadCloud className="w-7 h-7" />
          )}
        </div>

        <div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {isUploading ? 'Uploading and validating PDF...' : title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {subtitle} • Up to 200MB
          </p>
        </div>

        {!isUploading && (
          <div className="mt-2 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow-xs hover:bg-indigo-700 transition">
              <FileText className="w-3.5 h-3.5" /> Choose PDF File{multiple ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

