import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import { documentStore } from './documentStore.ts';
import type { EditOperation, SplitMode, SplitPart } from '../src/types/pdf.ts';

export const pdfRouter = Router();

// In-memory multer storage with 200MB limit per file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
    files: 20,
  },
  fileFilter: (_req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdfMime && !isPdfExt) {
      const err = new Error('Only PDF files are allowed');
      (err as any).code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

// Helper to convert hex to pdf-lib rgb
function hexToRgb(hex: string) {
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  if (cleanHex.length !== 6) {
    return rgb(0.5, 0.5, 0.5);
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

// Helper to sanitize non-WinAnsi characters to prevent pdf-lib encoding crashes
function sanitizeWinAnsi(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2013\u2014]/g, '-') // en/em dashes
    .replace(/[\u2026]/g, '...') // ellipsis
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ') // keep ASCII & Latin-1 supplement
    .trim();
}

// 1. POST /api/pdf/upload
pdfRouter.post(
  '/upload',
  upload.array('files'),
  async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({
          error: 'No files were uploaded. Please attach at least one PDF file.',
          code: 'NO_FILES_PROVIDED',
        });
      }

      const results = [];
      for (const file of files) {
        let pdfDoc: PDFDocument;
        try {
          pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
        } catch (err: any) {
          const errMsg = err?.message?.toLowerCase() || '';
          if (errMsg.includes('encrypt') || errMsg.includes('password')) {
            return res.status(400).json({
              error: `File "${file.originalname}" is encrypted or password-protected. Please unlock it before uploading.`,
              code: 'PASSWORD_PROTECTED',
            });
          }
          return res.status(400).json({
            error: `Failed to parse PDF file "${file.originalname}". The file may be corrupt or invalid.`,
            code: 'MALFORMED_PDF',
          });
        }

        const pageCount = pdfDoc.getPageCount();
        const stored = documentStore.addDocument(file.originalname, file.buffer, pageCount);
        results.push({
          id: stored.id,
          originalName: stored.originalName,
          pageCount: stored.pageCount,
          sizeBytes: stored.sizeBytes,
        });
      }

      return res.status(200).json(results);
    } catch (err) {
      next(err);
    }
  }
);

// 2. POST /api/pdf/merge
pdfRouter.post('/merge', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { fileIds } = req.body as { fileIds?: string[] };
    if (!Array.isArray(fileIds) || fileIds.length < 2) {
      return res.status(400).json({
        error: 'Merge requires at least two PDF documents.',
        code: 'INSUFFICIENT_FILES',
      });
    }

    const mergedDoc = await PDFDocument.create();

    for (let i = 0; i < fileIds.length; i++) {
      const id = fileIds[i];
      const doc = documentStore.getDocument(id);
      if (!doc) {
        return res.status(404).json({
          error: `Document with ID ${id} not found or has expired. Please re-upload your files.`,
          code: 'DOCUMENT_NOT_FOUND',
        });
      }

      try {
        const srcDoc = await PDFDocument.load(doc.buffer, { ignoreEncryption: true });
        const copiedPages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach((page) => mergedDoc.addPage(page));
      } catch (err: any) {
        return res.status(400).json({
          error: `Failed to merge document "${doc.originalName}": ${err.message}`,
          code: 'MERGE_FAILED',
        });
      }
    }

    const mergedBytes = await mergedDoc.save();
    const mergedBuffer = Buffer.from(mergedBytes);
    const pageCount = mergedDoc.getPageCount();
    const stored = documentStore.addDocument(
      `merged-${Date.now()}.pdf`,
      mergedBuffer,
      pageCount
    );

    return res.status(200).json({
      documentId: stored.id,
      downloadUrl: `/api/pdf/${stored.id}/download`,
      pageCount: stored.pageCount,
      originalName: stored.originalName,
    });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/pdf/split
pdfRouter.post('/split', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { fileId, mode, ranges, every, pages } = req.body as {
      fileId?: string;
      mode?: SplitMode;
      ranges?: string;
      every?: number;
      pages?: number[];
    };

    if (!fileId) {
      return res.status(400).json({
        error: 'Missing fileId for split operation.',
        code: 'MISSING_FILE_ID',
      });
    }

    const doc = documentStore.getDocument(fileId);
    if (!doc) {
      return res.status(404).json({
        error: 'Document not found or has expired.',
        code: 'DOCUMENT_NOT_FOUND',
      });
    }

    const srcDoc = await PDFDocument.load(doc.buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const baseName = doc.originalName.replace(/\.pdf$/i, '');
    const parts: SplitPart[] = [];

    if (mode === 'range') {
      if (!ranges || typeof ranges !== 'string' || !ranges.trim()) {
        return res.status(400).json({
          error: 'Please specify one or more page ranges (e.g. "1-3, 5, 7-10").',
          code: 'INVALID_RANGE_SPEC',
        });
      }

      const rangeSegments = ranges
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (rangeSegments.length === 0) {
        return res.status(400).json({
          error: 'No valid ranges found in input.',
          code: 'INVALID_RANGE_SPEC',
        });
      }

      for (let idx = 0; idx < rangeSegments.length; idx++) {
        const seg = rangeSegments[idx];
        const pageIndicesToCopy: number[] = [];

        if (seg.includes('-')) {
          const [startStr, endStr] = seg.split('-').map((s) => s.trim());
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);

          if (isNaN(start) || isNaN(end) || start < 1 || end < start || end > totalPages) {
            return res.status(400).json({
              error: `Invalid range "${seg}". Valid range must be between 1 and ${totalPages}.`,
              code: 'OUT_OF_RANGE',
            });
          }

          for (let p = start; p <= end; p++) {
            pageIndicesToCopy.push(p - 1);
          }
        } else {
          const single = parseInt(seg, 10);
          if (isNaN(single) || single < 1 || single > totalPages) {
            return res.status(400).json({
              error: `Invalid page "${seg}". Valid page must be between 1 and ${totalPages}.`,
              code: 'OUT_OF_RANGE',
            });
          }
          pageIndicesToCopy.push(single - 1);
        }

        const partDoc = await PDFDocument.create();
        const copied = await partDoc.copyPages(srcDoc, pageIndicesToCopy);
        copied.forEach((p) => partDoc.addPage(p));

        let partBytes: Uint8Array;
        try {
          partBytes = await partDoc.save({ useObjectStreams: false });
        } catch {
          partBytes = await partDoc.save();
        }

        const partBuffer = Buffer.from(partBytes);
        const partLabel = `Range ${seg}`;
        const safeSeg = seg.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${baseName}-${safeSeg}.pdf`;
        const storedPart = documentStore.addDocument(filename, partBuffer, partDoc.getPageCount());

        parts.push({
          documentId: storedPart.id,
          downloadUrl: `/api/pdf/${storedPart.id}/download`,
          label: partLabel,
          pageCount: storedPart.pageCount,
          sizeBytes: storedPart.sizeBytes,
        });
      }
    } else if (mode === 'every') {
      const step = parseInt(String(every), 10);
      if (isNaN(step) || step < 1) {
        return res.status(400).json({
          error: 'Please enter a valid number of pages per split (e.g. 1, 2, 5).',
          code: 'INVALID_SPLIT_STEP',
        });
      }

      let chunkIndex = 1;
      for (let start = 0; start < totalPages; start += step) {
        const end = Math.min(start + step, totalPages);
        const indices: number[] = [];
        for (let i = start; i < end; i++) {
          indices.push(i);
        }

        const partDoc = await PDFDocument.create();
        const copied = await partDoc.copyPages(srcDoc, indices);
        copied.forEach((p) => partDoc.addPage(p));

        let partBytes: Uint8Array;
        try {
          partBytes = await partDoc.save({ useObjectStreams: false });
        } catch {
          partBytes = await partDoc.save();
        }

        const partBuffer = Buffer.from(partBytes);
        const pageLabel =
          start + 1 === end
            ? `Page ${start + 1}`
            : `Pages ${start + 1}-${end}`;
        const filename = `${baseName}-part${chunkIndex}.pdf`;
        const storedPart = documentStore.addDocument(filename, partBuffer, partDoc.getPageCount());

        parts.push({
          documentId: storedPart.id,
          downloadUrl: `/api/pdf/${storedPart.id}/download`,
          label: pageLabel,
          pageCount: storedPart.pageCount,
          sizeBytes: storedPart.sizeBytes,
        });
        chunkIndex++;
      }
    } else if (mode === 'extract') {
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({
          error: 'Please select at least one page to extract.',
          code: 'NO_PAGES_SELECTED',
        });
      }

      const sortedPages = [...new Set(pages.map(Number))].sort((a, b) => a - b);
      const invalid = sortedPages.find((p) => p < 1 || p > totalPages);
      if (invalid) {
        return res.status(400).json({
          error: `Page ${invalid} is out of bounds (document has ${totalPages} pages).`,
          code: 'OUT_OF_RANGE',
        });
      }

      const indices = sortedPages.map((p) => p - 1);
      const partDoc = await PDFDocument.create();
      const copied = await partDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => partDoc.addPage(p));

      let partBytes: Uint8Array;
      try {
        partBytes = await partDoc.save({ useObjectStreams: false });
      } catch {
        partBytes = await partDoc.save();
      }

      const partBuffer = Buffer.from(partBytes);
      const label =
        sortedPages.length === 1
          ? `Page ${sortedPages[0]}`
          : `Extracted ${sortedPages.length} pages (${sortedPages.join(', ')})`;
      const filename = `${baseName}-extracted.pdf`;
      const storedPart = documentStore.addDocument(filename, partBuffer, partDoc.getPageCount());

      parts.push({
        documentId: storedPart.id,
        downloadUrl: `/api/pdf/${storedPart.id}/download`,
        label,
        pageCount: storedPart.pageCount,
        sizeBytes: storedPart.sizeBytes,
      });
    } else {
      return res.status(400).json({
        error: 'Invalid split mode specified. Must be "range", "every", or "extract".',
        code: 'INVALID_SPLIT_MODE',
      });
    }

    return res.status(200).json({ parts });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/pdf/edit
pdfRouter.post('/edit', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { fileId, operations } = req.body as {
      fileId?: string;
      operations?: EditOperation[];
    };

    if (!fileId) {
      return res.status(400).json({
        error: 'Missing fileId for edit operation.',
        code: 'MISSING_FILE_ID',
      });
    }

    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({
        error: 'At least one edit operation is required.',
        code: 'NO_OPERATIONS_PROVIDED',
      });
    }

    const doc = documentStore.getDocument(fileId);
    if (!doc) {
      return res.status(404).json({
        error: 'Document not found or has expired.',
        code: 'DOCUMENT_NOT_FOUND',
      });
    }

    let currentDoc = await PDFDocument.load(doc.buffer, { ignoreEncryption: true });

    for (const op of operations) {
      if (op.type === 'rotate') {
        const pagesToRotate = new Set((op.pages || []).map(Number));
        const count = currentDoc.getPageCount();
        for (let i = 1; i <= count; i++) {
          if (pagesToRotate.size === 0 || pagesToRotate.has(i)) {
            const page = currentDoc.getPage(i - 1);
            const currentAngle = page.getRotation()?.angle ?? 0;
            const newAngle = (currentAngle + (Number(op.degrees) || 90) + 360) % 360;
            page.setRotation(degrees(newAngle));
          }
        }
      } else if (op.type === 'delete') {
        const pagesToDelete = new Set((op.pages || []).map(Number));
        const count = currentDoc.getPageCount();
        const remainingIndices: number[] = [];
        for (let i = 1; i <= count; i++) {
          if (!pagesToDelete.has(i)) {
            remainingIndices.push(i - 1);
          }
        }

        if (remainingIndices.length === 0) {
          return res.status(400).json({
            error: 'Cannot delete all pages of the document. At least one page must remain.',
            code: 'CANNOT_DELETE_ALL_PAGES',
          });
        }

        // Rebuild a new document skipping deleted pages
        const newDoc = await PDFDocument.create();
        const copied = await newDoc.copyPages(currentDoc, remainingIndices);
        copied.forEach((p) => newDoc.addPage(p));
        currentDoc = newDoc;
      } else if (op.type === 'watermark') {
        const font = await currentDoc.embedFont(StandardFonts.HelveticaBold);
        const pageCount = currentDoc.getPageCount();
        const watermarkColor = hexToRgb(op.color || '#ff0000');
        const fontSize = Math.max(10, Math.min(120, Number(op.fontSize) || 48));
        const opacity = Math.max(0.05, Math.min(1, op.opacity ?? 0.3));
        const rotationAngle = Number(op.rotation) ?? 45;
        const cleanText = sanitizeWinAnsi(op.text || 'WATERMARK');

        for (let i = 0; i < pageCount; i++) {
          const page = currentDoc.getPage(i);
          const { width, height } = page.getSize();
          const textWidth = font.widthOfTextAtSize(cleanText, fontSize);
          const textHeight = font.heightAtSize(fontSize);

          // Center watermark
          page.drawText(cleanText, {
            x: width / 2 - (textWidth / 2) * Math.cos((rotationAngle * Math.PI) / 180),
            y: height / 2 - (textHeight / 2) * Math.sin((rotationAngle * Math.PI) / 180),
            size: fontSize,
            font,
            color: watermarkColor,
            opacity,
            rotate: degrees(rotationAngle),
          });
        }
      } else if (op.type === 'pageNumbers') {
        const font = await currentDoc.embedFont(StandardFonts.Helvetica);
        const pageCount = currentDoc.getPageCount();
        const startAt = Number(op.startAt) ?? 1;
        const fontSize = Math.max(8, Math.min(24, Number(op.fontSize) || 10));

        for (let i = 0; i < pageCount; i++) {
          const page = currentDoc.getPage(i);
          const { width } = page.getSize();
          const pageNum = startAt + i;
          const text = sanitizeWinAnsi(`Page ${pageNum} of ${pageCount}`);
          const textWidth = font.widthOfTextAtSize(text, fontSize);

          // Draw at bottom-center
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: 25,
            size: fontSize,
            font,
            color: rgb(0.2, 0.25, 0.3),
          });
        }
      }
    }

    let modifiedBytes: Uint8Array;
    try {
      modifiedBytes = await currentDoc.save({ useObjectStreams: false });
    } catch {
      modifiedBytes = await currentDoc.save();
    }

    const modifiedBuffer = Buffer.from(modifiedBytes);
    const newPageCount = currentDoc.getPageCount();
    const updated = documentStore.addDocument(
      doc.originalName,
      modifiedBuffer,
      newPageCount
    );

    return res.status(200).json({
      documentId: updated.id,
      downloadUrl: `/api/pdf/${updated.id}/download`,
      pageCount: updated.pageCount,
      originalName: updated.originalName,
      sizeBytes: updated.sizeBytes,
    });
  } catch (err) {
    next(err);
  }
});

// 5. GET /api/pdf/:id/download
pdfRouter.get('/:id/download', (req: Request, res: Response): any => {
  const { id } = req.params;
  const doc = documentStore.getDocument(id);
  if (!doc) {
    return res.status(404).json({
      error: 'Document not found or has expired. Please re-upload your PDF file.',
      code: 'DOCUMENT_NOT_FOUND',
    });
  }

  const isInline = req.query.inline === 'true';
  const dispositionType = isInline ? 'inline' : 'attachment';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${dispositionType}; filename="${encodeURIComponent(doc.originalName)}"`
  );
  res.setHeader('Content-Length', doc.buffer.length);
  return res.send(doc.buffer);
});

// 5b. GET /api/pdf/:id/view (always inline for browser rendering)
pdfRouter.get('/:id/view', (req: Request, res: Response): any => {
  const { id } = req.params;
  const doc = documentStore.getDocument(id);
  if (!doc) {
    return res.status(404).json({
      error: 'Document not found or has expired. Please re-upload your PDF file.',
      code: 'DOCUMENT_NOT_FOUND',
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(doc.originalName)}"`
  );
  res.setHeader('Content-Length', doc.buffer.length);
  return res.send(doc.buffer);
});

// 6. GET /api/pdf/:id/preview/:page
pdfRouter.get('/:id/preview/:page', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id, page } = req.params;
    const pageNum = parseInt(page, 10);
    const doc = documentStore.getDocument(id);
    if (!doc) {
      return res.status(404).json({
        error: 'Document not found or has expired.',
        code: 'DOCUMENT_NOT_FOUND',
      });
    }

    const srcDoc = await PDFDocument.load(doc.buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
      return res.status(400).json({
        error: `Page ${page} out of bounds (1-${totalPages}).`,
        code: 'PAGE_OUT_OF_BOUNDS',
      });
    }

    // Extract single page and send as application/pdf for easy browser preview
    const singleDoc = await PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(srcDoc, [pageNum - 1]);
    singleDoc.addPage(copiedPage);

    const singleBytes = await singleDoc.save();
    const buffer = Buffer.from(singleBytes);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/pdf/:id/info
pdfRouter.get('/:id/info', (req: Request, res: Response): any => {
  const { id } = req.params;
  const meta = documentStore.getDocumentMeta(id);
  if (!meta) {
    return res.status(404).json({
      error: 'Document not found or has expired.',
      code: 'DOCUMENT_NOT_FOUND',
    });
  }
  return res.json(meta);
});

// 8. DELETE /api/pdf/:id
pdfRouter.delete('/:id', (req: Request, res: Response): any => {
  const { id } = req.params;
  const success = documentStore.deleteDocument(id);
  return res.json({ success, message: success ? 'Document deleted' : 'Document not found' });
});

// 9. POST /api/pdf/generate-sample
pdfRouter.post('/generate-sample', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { pages = 3, title = 'Sample Document' } = req.body;
    const pageCount = Math.min(100, Math.max(1, parseInt(String(pages), 10) || 3));
    const sampleDoc = await documentStore.generateSamplePdf(pageCount, title);

    return res.status(200).json({
      id: sampleDoc.id,
      originalName: sampleDoc.originalName,
      pageCount: sampleDoc.pageCount,
      sizeBytes: sampleDoc.sizeBytes,
      downloadUrl: `/api/pdf/${sampleDoc.id}/download`,
    });
  } catch (err) {
    next(err);
  }
});

// 10. GET /api/pdf/:id/form (inspect form fields)
pdfRouter.get('/:id/form', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const doc = documentStore.getDocument(id);
    if (!doc) {
      return res.status(404).json({
        error: 'Document not found or has expired.',
        code: 'DOCUMENT_NOT_FOUND',
      });
    }

    const pdfDoc = await PDFDocument.load(doc.buffer, { ignoreEncryption: true });
    let fields: any[] = [];
    try {
      const form = pdfDoc.getForm();
      const rawFields = form.getFields();
      fields = rawFields.map((field) => {
        const name = field.getName();
        const constructorName = field.constructor.name;
        let type = 'unknown';
        let value: any = '';
        let options: string[] | undefined = undefined;

        if (constructorName === 'PDFTextField') {
          type = 'text';
          try { value = (field as any).getText() || ''; } catch { value = ''; }
        } else if (constructorName === 'PDFCheckBox') {
          type = 'checkbox';
          try { value = (field as any).isChecked() || false; } catch { value = false; }
        } else if (constructorName === 'PDFDropdown') {
          type = 'dropdown';
          try {
            const sel = (field as any).getSelected();
            value = Array.isArray(sel) ? sel[0] || '' : sel || '';
            options = (field as any).getOptions() || [];
          } catch {
            value = '';
          }
        } else if (constructorName === 'PDFRadioGroup') {
          type = 'radio';
          try {
            value = (field as any).getSelected() || '';
            options = (field as any).getOptions() || [];
          } catch {
            value = '';
          }
        } else if (constructorName === 'PDFButton') {
          type = 'button';
        }

        return {
          name,
          type,
          value,
          options,
          readOnly: (field as any).isReadOnly ? (field as any).isReadOnly() : false,
        };
      });
    } catch (e) {
      console.warn('Form inspection notice:', e);
      fields = [];
    }

    return res.status(200).json({
      hasForm: fields.length > 0,
      fieldsCount: fields.length,
      fields,
    });
  } catch (err) {
    next(err);
  }
});

// 11. POST /api/pdf/:id/fill-form
pdfRouter.post('/:id/fill-form', async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { id } = req.params;
    const { acroFieldValues, annotations, flatten } = req.body as {
      acroFieldValues?: Record<string, string | boolean>;
      annotations?: any[];
      flatten?: boolean;
    };

    const doc = documentStore.getDocument(id);
    if (!doc) {
      return res.status(404).json({
        error: 'Document not found or has expired. Please re-upload your PDF file.',
        code: 'DOCUMENT_NOT_FOUND',
      });
    }

    const currentDoc = await PDFDocument.load(doc.buffer, { ignoreEncryption: true });

    // 1. Fill AcroForm interactive fields if provided
    if (acroFieldValues && typeof acroFieldValues === 'object') {
      try {
        const form = currentDoc.getForm();
        for (const [fieldName, val] of Object.entries(acroFieldValues)) {
          try {
            const field = (form as any).getFieldMaybe ? (form as any).getFieldMaybe(fieldName) : form.getField(fieldName);
            if (!field) continue;
            const cName = field.constructor.name;
            if (cName === 'PDFTextField') {
              (field as any).setText(sanitizeWinAnsi(String(val ?? '')));
            } else if (cName === 'PDFCheckBox') {
              if (Boolean(val)) {
                (field as any).check();
              } else {
                (field as any).uncheck();
              }
            } else if (cName === 'PDFDropdown' || cName === 'PDFRadioGroup') {
              (field as any).select(String(val));
            }
          } catch (err) {
            console.warn(`Could not set field ${fieldName}:`, err);
          }
        }
      } catch (err) {
        console.warn('Could not populate AcroForm fields:', err);
      }
    }

    // 2. Stamp freeform annotations (text, checkmark, cross, date, signature)
    if (Array.isArray(annotations) && annotations.length > 0) {
      const helvetica = await currentDoc.embedFont(StandardFonts.Helvetica);
      const totalPages = currentDoc.getPageCount();

      for (const ann of annotations) {
        const pageIdx = (Number(ann.page) || 1) - 1;
        if (pageIdx < 0 || pageIdx >= totalPages) continue;

        const page = currentDoc.getPage(pageIdx);
        const { width: pWidth, height: pHeight } = page.getSize();

        // Convert percentage coordinates (0-100 from top-left) to PDF coordinates (bottom-left origin)
        const pdfX = (Number(ann.x) / 100) * pWidth;
        const pdfY = pHeight - (Number(ann.y) / 100) * pHeight;
        const fontSize = Math.max(8, Math.min(72, Number(ann.fontSize) || 12));
        const color = hexToRgb(ann.color || '#1e293b');

        if (ann.type === 'text' || ann.type === 'date') {
          const text = sanitizeWinAnsi(ann.text || (ann.type === 'date' ? new Date().toISOString().slice(0, 10) : ''));
          if (text) {
            page.drawText(text, {
              x: pdfX,
              y: Math.max(5, pdfY - fontSize),
              size: fontSize,
              font: helvetica,
              color,
            });
          }
        } else if (ann.type === 'check') {
          const sz = Math.max(12, fontSize * 1.3);
          page.drawLine({
            start: { x: pdfX, y: pdfY - sz * 0.5 },
            end: { x: pdfX + sz * 0.35, y: pdfY - sz * 0.85 },
            thickness: 2.2,
            color,
          });
          page.drawLine({
            start: { x: pdfX + sz * 0.35, y: pdfY - sz * 0.85 },
            end: { x: pdfX + sz * 0.9, y: pdfY - sz * 0.15 },
            thickness: 2.2,
            color,
          });
        } else if (ann.type === 'cross') {
          const sz = Math.max(10, fontSize);
          page.drawLine({
            start: { x: pdfX, y: pdfY },
            end: { x: pdfX + sz, y: pdfY - sz },
            thickness: 2,
            color,
          });
          page.drawLine({
            start: { x: pdfX, y: pdfY - sz },
            end: { x: pdfX + sz, y: pdfY },
            thickness: 2,
            color,
          });
        } else if (ann.type === 'signature' && ann.dataUrl) {
          try {
            const base64Data = ann.dataUrl.includes(',') ? ann.dataUrl.split(',')[1] : ann.dataUrl;
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const pngImage = await currentDoc.embedPng(imgBuffer);
            const sigW = ann.width ? (Number(ann.width) / 100) * pWidth : 130;
            const sigH = ann.height ? (Number(ann.height) / 100) * pHeight : 45;

            page.drawImage(pngImage, {
              x: pdfX,
              y: Math.max(0, pdfY - sigH),
              width: sigW,
              height: sigH,
            });
          } catch (sigErr) {
            console.warn('Could not embed signature image:', sigErr);
          }
        }
      }
    }

    if (flatten) {
      try {
        const form = currentDoc.getForm();
        form.flatten();
      } catch (fErr) {
        console.warn('Could not flatten form:', fErr);
      }
    }

    let modifiedBytes: Uint8Array;
    try {
      modifiedBytes = await currentDoc.save({ useObjectStreams: false });
    } catch {
      modifiedBytes = await currentDoc.save();
    }

    const modifiedBuffer = Buffer.from(modifiedBytes);
    const updated = documentStore.addDocument(
      doc.originalName,
      modifiedBuffer,
      currentDoc.getPageCount()
    );

    return res.status(200).json({
      documentId: updated.id,
      downloadUrl: `/api/pdf/${updated.id}/download`,
      pageCount: updated.pageCount,
      originalName: updated.originalName,
      sizeBytes: updated.sizeBytes,
    });
  } catch (err) {
    next(err);
  }
});

// 12. POST /api/pdf/generate-form-sample
pdfRouter.post('/generate-form-sample', async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const sampleDoc = await documentStore.generateFillableFormSamplePdf();
    return res.status(200).json({
      id: sampleDoc.id,
      originalName: sampleDoc.originalName,
      pageCount: sampleDoc.pageCount,
      sizeBytes: sampleDoc.sizeBytes,
      downloadUrl: `/api/pdf/${sampleDoc.id}/download`,
    });
  } catch (err) {
    next(err);
  }
});

// Global error handler for pdfRouter
pdfRouter.use((err: any, _req: Request, res: Response, next: NextFunction): any => {
  console.error('PDF Router Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File size exceeds maximum allowed limit of 200 MB.',
        code: 'FILE_TOO_LARGE',
      });
    }
    return res.status(400).json({
      error: `Upload error: ${err.message}`,
      code: err.code || 'UPLOAD_ERROR',
    });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    error: err.message || 'An unexpected error occurred while processing PDF.',
    code: err.code || 'INTERNAL_ERROR',
  });
});
