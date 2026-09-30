import * as pdfjsLib from 'pdfjs-dist';
// Import local worker via Vite URL query to avoid cross-origin CDN fetch issues
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch (e) {
    console.warn('Failed to set local PDF worker source, falling back to CDN', e);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

// In-memory cache for rendered thumbnails: key = `${documentId || sourceHash}_page_${pageNum}_scale_${scale}`
const thumbnailCache = new Map<string, string>();
const pdfDocCache = new Map<string, pdfjsLib.PDFDocumentProxy>();

export async function loadPdfDocument(source: string | ArrayBuffer | Uint8Array, cacheKey?: string): Promise<pdfjsLib.PDFDocumentProxy> {
  if (cacheKey && pdfDocCache.has(cacheKey)) {
    return pdfDocCache.get(cacheKey)!;
  }

  let data: Uint8Array;
  if (typeof source === 'string') {
    // Fetch directly on the main thread so relative URLs, credentials, and CORS work reliably
    const res = await fetch(source);
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const json = await res.json();
        if (json.error) errorMsg = json.error;
      } catch {
        // ignore
      }
      throw new Error(`Failed to load PDF (${errorMsg})`);
    }
    const buffer = await res.arrayBuffer();
    data = new Uint8Array(buffer);
  } else if (source instanceof Uint8Array) {
    data = source;
  } else {
    data = new Uint8Array(source);
  }

  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapPacked: true,
  });

  const doc = await loadingTask.promise;
  if (cacheKey) {
    pdfDocCache.set(cacheKey, doc);
  }
  return doc;
}

export function clearPdfDocCache(cacheKey?: string) {
  if (cacheKey) {
    pdfDocCache.delete(cacheKey);
    // Also remove matching thumbnail entries
    for (const key of thumbnailCache.keys()) {
      if (key.startsWith(cacheKey)) {
        thumbnailCache.delete(key);
      }
    }
  } else {
    pdfDocCache.clear();
    thumbnailCache.clear();
  }
}

export async function renderPageThumbnail(
  source: string | ArrayBuffer | Uint8Array,
  pageNum: number,
  scale = 0.35,
  cacheKey?: string
): Promise<string> {
  const cacheId = `${cacheKey || 'temp'}_p${pageNum}_s${scale}`;
  if (thumbnailCache.has(cacheId)) {
    return thumbnailCache.get(cacheId)!;
  }

  try {
    const doc = await loadPdfDocument(source, cacheKey);
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D canvas context');

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext: any = {
      canvasContext: ctx,
      viewport,
      canvas,
    };
    const renderTask = page.render(renderContext);

    await renderTask.promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    thumbnailCache.set(cacheId, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error(`Error rendering thumbnail for page ${pageNum}:`, err);
    throw err;
  }
}

export async function renderPageOnCanvas(
  source: string | ArrayBuffer | Uint8Array,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale = 1.0,
  cacheKey?: string
): Promise<{ width: number; height: number; cancel: () => void }> {
  const doc = await loadPdfDocument(source, cacheKey);
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  // Handle HiDPI displays
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Fill white canvas background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  const renderContext: any = {
    canvasContext: ctx,
    viewport,
  };
  if (transform) {
    renderContext.transform = transform;
  }

  const renderTask = page.render(renderContext);

  return {
    width: viewport.width,
    height: viewport.height,
    cancel: () => {
      try {
        renderTask.cancel();
      } catch {
        // ignore cancellation errors
      }
    },
  };
}
