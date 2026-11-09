import { extname } from "node:path";

/**
 * Text extraction for uploaded documents. One extractor per format; add a
 * format by adding an entry to EXTRACTORS (and its extension to the client's
 * `accept` list).
 */

interface Extractor {
  mime: string;
  extract(buffer: Buffer): Promise<string>;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((page) => page.trim()).filter(Boolean).join("\n\n");
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await (mammoth.default ?? mammoth).extractRawText({ buffer });
  return value;
}

const plainText = async (buffer: Buffer) => buffer.toString("utf-8").replace(/^﻿/, "");

const EXTRACTORS: Record<string, Extractor> = {
  ".pdf": { mime: "application/pdf", extract: extractPdf },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extract: extractDocx,
  },
  ".txt": { mime: "text/plain", extract: plainText },
  ".md": { mime: "text/markdown", extract: plainText },
  ".markdown": { mime: "text/markdown", extract: plainText },
  ".csv": { mime: "text/csv", extract: plainText },
  ".json": { mime: "application/json", extract: plainText },
};

export const SUPPORTED_DOCUMENT_EXTENSIONS = Object.keys(EXTRACTORS);

/** Collapses runs of blank lines/spaces that PDF extraction tends to produce. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocumentText(
  buffer: Buffer,
  filename: string,
): Promise<{ text: string; mime: string }> {
  const extractor = EXTRACTORS[extname(filename).toLowerCase()];
  if (!extractor) {
    throw new Error(
      `Định dạng chưa hỗ trợ. Hỗ trợ: ${SUPPORTED_DOCUMENT_EXTENSIONS.join(", ")}.`,
    );
  }
  let text: string;
  try {
    text = normalize(await extractor.extract(buffer));
  } catch (err) {
    throw new Error(
      `Không đọc được nội dung file: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (!text) {
    throw new Error(
      "File không có chữ đọc được (có thể là PDF dạng ảnh scan — cần OCR trước khi tải lên).",
    );
  }
  return { text, mime: extractor.mime };
}
