export interface StoredDocumentMeta {
  id: string;
  originalName: string;
  pageCount: number;
  sizeBytes: number;
  createdAt?: string;
  expiresAt?: string;
}

export type EditOperation =
  | { type: 'rotate'; pages: number[]; degrees: 90 | -90 | 180 }
  | { type: 'delete'; pages: number[] }
  | { type: 'watermark'; text: string; fontSize: number; opacity: number; color: string; rotation: number }
  | { type: 'pageNumbers'; startAt: number; fontSize: number };

export type SplitMode = 'range' | 'every' | 'extract';

export interface SplitPart {
  documentId: string;
  downloadUrl: string;
  label: string;
  pageCount: number;
  sizeBytes?: number;
}

export interface SplitResponse {
  parts: SplitPart[];
}

export interface MergeResponse {
  documentId: string;
  downloadUrl: string;
  pageCount: number;
  originalName: string;
}

export interface EditResponse {
  documentId: string;
  downloadUrl: string;
  pageCount: number;
  originalName: string;
  sizeBytes?: number;
}

export interface UploadItem {
  id: string;
  originalName: string;
  pageCount: number;
  sizeBytes: number;
  file?: File;
  previewUrl?: string;
}

export type FormFieldType = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'button' | 'unknown';

export interface FormFieldMeta {
  name: string;
  type: FormFieldType;
  value: string | boolean;
  options?: string[];
  readOnly?: boolean;
}

export interface FormInspectionResponse {
  hasForm: boolean;
  fieldsCount: number;
  fields: FormFieldMeta[];
}

export type AnnotationType = 'text' | 'check' | 'cross' | 'date' | 'signature';

export interface FormAnnotation {
  id: string;
  page: number; // 1-indexed
  type: AnnotationType;
  x: number; // percentage from left (0 to 100)
  y: number; // percentage from top (0 to 100)
  text?: string;
  fontSize?: number;
  color?: string; // hex
  dataUrl?: string; // PNG base64 for drawn signatures
  width?: number; // percentage width
  height?: number; // percentage height
}

export interface FillFormRequest {
  fileId: string;
  acroFieldValues?: Record<string, string | boolean>;
  annotations?: FormAnnotation[];
  flatten?: boolean;
}

export interface FillFormResponse {
  documentId: string;
  downloadUrl: string;
  pageCount: number;
  originalName: string;
  sizeBytes?: number;
}
