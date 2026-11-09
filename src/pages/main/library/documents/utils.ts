/** Extensions the server can extract text from (keep in sync with server/services/documents/extract.ts). */
export const DOCUMENT_ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json";

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "text/markdown": "MD",
  "text/csv": "CSV",
  "application/json": "JSON",
  "text/plain": "TXT",
};

export function documentTypeLabel(mime: string): string {
  return MIME_LABELS[mime] ?? mime.split("/").pop()?.toUpperCase() ?? "?";
}

export function formatCharCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
