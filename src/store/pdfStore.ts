import { create } from 'zustand';
import type { StoredDocumentMeta, SplitMode, SplitPart } from '../types/pdf.ts';

export interface MergeItem extends StoredDocumentMeta {
  thumbnail?: string;
}

interface PdfState {
  // Theme
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Global Preview Modal
  previewModal: {
    isOpen: boolean;
    documentId: string | null;
    documentName: string;
    currentPage: number;
    totalPages: number;
  };
  openPreview: (documentId: string, documentName: string, page?: number, totalPages?: number) => void;
  closePreview: () => void;
  setPreviewPage: (page: number) => void;

  // 1. Merge State
  mergeFiles: MergeItem[];
  isMerging: boolean;
  mergedResult: {
    documentId: string;
    downloadUrl: string;
    pageCount: number;
    originalName: string;
  } | null;
  addMergeFiles: (files: StoredDocumentMeta[]) => void;
  removeMergeFile: (id: string) => void;
  reorderMergeFiles: (startIndex: number, endIndex: number) => void;
  setMergeFileThumbnail: (id: string, thumbnail: string) => void;
  clearMergeFiles: () => void;
  setMerging: (loading: boolean) => void;
  setMergedResult: (result: PdfState['mergedResult']) => void;

  // 2. Split State
  splitFile: StoredDocumentMeta | null;
  splitMode: SplitMode;
  rangeInput: string;
  everyInput: number;
  selectedSplitPages: number[];
  isSplitting: boolean;
  splitResults: SplitPart[];
  setSplitFile: (file: StoredDocumentMeta | null) => void;
  setSplitMode: (mode: SplitMode) => void;
  setRangeInput: (val: string) => void;
  setEveryInput: (val: number) => void;
  toggleSplitPage: (page: number) => void;
  selectAllSplitPages: () => void;
  clearSplitPages: () => void;
  setSplitResults: (parts: SplitPart[]) => void;
  setSplitting: (loading: boolean) => void;
  resetSplit: () => void;

  // 3. Edit State
  editFile: StoredDocumentMeta | null;
  undoStack: StoredDocumentMeta[];
  selectedEditPages: number[];
  isEditing: boolean;
  setEditFile: (file: StoredDocumentMeta | null) => void;
  applyEditUpdate: (file: StoredDocumentMeta) => void;
  toggleEditPage: (page: number) => void;
  selectAllEditPages: () => void;
  clearEditPages: () => void;
  pushUndo: (previousDoc: StoredDocumentMeta) => void;
  popUndo: () => StoredDocumentMeta | undefined;
  setEditing: (loading: boolean) => void;
  resetEdit: () => void;
}

const getInitialDarkMode = () => {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('pdftoolkit_theme');
  if (saved) return saved === 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const usePdfStore = create<PdfState>((set, get) => ({
  // Theme
  isDarkMode: getInitialDarkMode(),
  toggleDarkMode: () => {
    set((state) => {
      const next = !state.isDarkMode;
      if (typeof window !== 'undefined') {
        localStorage.setItem('pdftoolkit_theme', next ? 'dark' : 'light');
        if (next) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      return { isDarkMode: next };
    });
  },

  // Preview Modal
  previewModal: {
    isOpen: false,
    documentId: null,
    documentName: '',
    currentPage: 1,
    totalPages: 1,
  },
  openPreview: (documentId, documentName, page = 1, totalPages = 1) =>
    set({
      previewModal: {
        isOpen: true,
        documentId,
        documentName,
        currentPage: page,
        totalPages,
      },
    }),
  closePreview: () =>
    set((state) => ({
      previewModal: { ...state.previewModal, isOpen: false },
    })),
  setPreviewPage: (page) =>
    set((state) => ({
      previewModal: { ...state.previewModal, currentPage: page },
    })),

  // Merge
  mergeFiles: [],
  isMerging: false,
  mergedResult: null,
  addMergeFiles: (newFiles) =>
    set((state) => {
      const existingIds = new Set(state.mergeFiles.map((f) => f.id));
      const unique = newFiles.filter((f) => !existingIds.has(f.id));
      return { mergeFiles: [...state.mergeFiles, ...unique], mergedResult: null };
    }),
  removeMergeFile: (id) =>
    set((state) => ({
      mergeFiles: state.mergeFiles.filter((f) => f.id !== id),
      mergedResult: null,
    })),
  reorderMergeFiles: (startIndex, endIndex) =>
    set((state) => {
      const list = [...state.mergeFiles];
      const [removed] = list.splice(startIndex, 1);
      list.splice(endIndex, 0, removed);
      return { mergeFiles: list, mergedResult: null };
    }),
  setMergeFileThumbnail: (id, thumbnail) =>
    set((state) => ({
      mergeFiles: state.mergeFiles.map((f) => (f.id === id ? { ...f, thumbnail } : f)),
    })),
  clearMergeFiles: () => set({ mergeFiles: [], mergedResult: null }),
  setMerging: (isMerging) => set({ isMerging }),
  setMergedResult: (mergedResult) => set({ mergedResult }),

  // Split
  splitFile: null,
  splitMode: 'range',
  rangeInput: '1-2, 3',
  everyInput: 2,
  selectedSplitPages: [],
  isSplitting: false,
  splitResults: [],
  setSplitFile: (file) =>
    set({
      splitFile: file,
      splitResults: [],
      selectedSplitPages: [],
      rangeInput: file && file.pageCount > 1 ? `1-${Math.min(2, file.pageCount)}` : '1',
      everyInput: Math.max(1, Math.floor((file?.pageCount || 2) / 2)) || 1,
    }),
  setSplitMode: (splitMode) => set({ splitMode }),
  setRangeInput: (rangeInput) => set({ rangeInput }),
  setEveryInput: (everyInput) => set({ everyInput }),
  toggleSplitPage: (page) =>
    set((state) => {
      const exists = state.selectedSplitPages.includes(page);
      return {
        selectedSplitPages: exists
          ? state.selectedSplitPages.filter((p) => p !== page)
          : [...state.selectedSplitPages, page].sort((a, b) => a - b),
      };
    }),
  selectAllSplitPages: () =>
    set((state) => {
      if (!state.splitFile) return {};
      const all = Array.from({ length: state.splitFile.pageCount }, (_, i) => i + 1);
      return { selectedSplitPages: all };
    }),
  clearSplitPages: () => set({ selectedSplitPages: [] }),
  setSplitResults: (splitResults) => set({ splitResults }),
  setSplitting: (isSplitting) => set({ isSplitting }),
  resetSplit: () =>
    set({
      splitFile: null,
      splitResults: [],
      selectedSplitPages: [],
      rangeInput: '1-2, 3',
      everyInput: 2,
    }),

  // Edit
  editFile: null,
  undoStack: [],
  selectedEditPages: [],
  isEditing: false,
  setEditFile: (file) =>
    set({
      editFile: file,
      undoStack: [],
      selectedEditPages: [],
    }),
  applyEditUpdate: (file) =>
    set({
      editFile: file,
      selectedEditPages: [],
    }),
  toggleEditPage: (page) =>
    set((state) => {
      const exists = state.selectedEditPages.includes(page);
      return {
        selectedEditPages: exists
          ? state.selectedEditPages.filter((p) => p !== page)
          : [...state.selectedEditPages, page].sort((a, b) => a - b),
      };
    }),
  selectAllEditPages: () =>
    set((state) => {
      if (!state.editFile) return {};
      const all = Array.from({ length: state.editFile.pageCount }, (_, i) => i + 1);
      return { selectedEditPages: all };
    }),
  clearEditPages: () => set({ selectedEditPages: [] }),
  pushUndo: (previousDoc) =>
    set((state) => ({
      undoStack: [...state.undoStack, previousDoc],
    })),
  popUndo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return undefined;
    const previous = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      editFile: previous,
      selectedEditPages: [],
    });
    return previous;
  },
  setEditing: (isEditing) => set({ isEditing }),
  resetEdit: () =>
    set({
      editFile: null,
      undoStack: [],
      selectedEditPages: [],
    }),
}));
