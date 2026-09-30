import type {
  StoredDocumentMeta,
  MergeResponse,
  SplitResponse,
  EditResponse,
  EditOperation,
  SplitMode,
  FormInspectionResponse,
  FillFormRequest,
  FillFormResponse,
} from '../types/pdf.ts';

export class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', statusCode: number = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `Server responded with status ${res.status}`;
    let code = 'HTTP_ERROR';
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMsg = data.error;
        code = data.code || code;
      }
    } catch {
      // not JSON
    }
    throw new ApiError(errorMsg, code, res.status);
  }
  return res.json() as Promise<T>;
}

export const pdfApi = {
  async uploadFiles(files: File[]): Promise<StoredDocumentMeta[]> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const res = await fetch('/api/pdf/upload', {
      method: 'POST',
      body: formData,
    });
    return handleResponse<StoredDocumentMeta[]>(res);
  },

  async mergeFiles(fileIds: string[]): Promise<MergeResponse> {
    const res = await fetch('/api/pdf/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds }),
    });
    return handleResponse<MergeResponse>(res);
  },

  async splitPdf(params: {
    fileId: string;
    mode: SplitMode;
    ranges?: string;
    every?: number;
    pages?: number[];
  }): Promise<SplitResponse> {
    const res = await fetch('/api/pdf/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<SplitResponse>(res);
  },

  async editPdf(fileId: string, operations: EditOperation[]): Promise<EditResponse> {
    const res = await fetch('/api/pdf/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, operations }),
    });
    return handleResponse<EditResponse>(res);
  },

  async deletePdf(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/pdf/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  async generateSample(pages = 3, title = 'Sample Document'): Promise<StoredDocumentMeta & { downloadUrl: string }> {
    const res = await fetch('/api/pdf/generate-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages, title }),
    });
    return handleResponse<StoredDocumentMeta & { downloadUrl: string }>(res);
  },

  async generateFormSample(): Promise<StoredDocumentMeta & { downloadUrl: string }> {
    const res = await fetch('/api/pdf/generate-form-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<StoredDocumentMeta & { downloadUrl: string }>(res);
  },

  async inspectForm(fileId: string): Promise<FormInspectionResponse> {
    const res = await fetch(`/api/pdf/${fileId}/form`);
    return handleResponse<FormInspectionResponse>(res);
  },

  async fillForm(req: FillFormRequest): Promise<FillFormResponse> {
    const res = await fetch(`/api/pdf/${req.fileId}/fill-form`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<FillFormResponse>(res);
  },

  getDownloadUrl(id: string): string {
    return `/api/pdf/${id}/download`;
  },
};
