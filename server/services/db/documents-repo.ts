import { randomUUID } from "node:crypto";
import type {
  DocumentLink,
  DocumentRecord,
  DocumentSummary,
  DocumentTargetType,
} from "../../../shared/types.js";
import { getDb } from "./client.js";

export type { DocumentTargetType };

interface DocumentRow {
  id: string;
  user_id: string;
  file_id: string | null;
  title: string;
  mime: string;
  text_content?: string;
  char_count: number;
  created_at: string;
  owner_email?: string | null;
}

function rowToSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    mime: row.mime,
    charCount: row.char_count,
    fileId: row.file_id ?? undefined,
    createdAt: row.created_at,
    ownerEmail: row.owner_email ?? undefined,
  };
}

const SUMMARY_COLUMNS = `d.id, d.user_id, d.file_id, d.title, d.mime, d.char_count, d.created_at, u.email AS owner_email`;

export function createDocument(
  userId: string,
  doc: { title: string; mime: string; textContent: string; fileId?: string },
): DocumentRecord {
  const record: DocumentRecord = {
    id: randomUUID(),
    title: doc.title,
    mime: doc.mime,
    textContent: doc.textContent,
    charCount: doc.textContent.length,
    fileId: doc.fileId,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO documents (id, user_id, file_id, title, mime, text_content, char_count, created_at)
       VALUES (@id, @userId, @fileId, @title, @mime, @textContent, @charCount, @createdAt)`,
    )
    .run({ ...record, fileId: record.fileId ?? null, userId });
  return record;
}

export function listDocuments(userId: string, isAdmin: boolean): DocumentSummary[] {
  const base = `SELECT ${SUMMARY_COLUMNS} FROM documents d LEFT JOIN users u ON u.id = d.user_id`;
  const rows = isAdmin
    ? (getDb().prepare(`${base} ORDER BY d.created_at DESC`).all() as DocumentRow[])
    : (getDb()
        .prepare(`${base} WHERE d.user_id = ? ORDER BY d.created_at DESC`)
        .all(userId) as DocumentRow[]);
  const links = getDb()
    .prepare("SELECT document_id, target_type, target_id FROM document_links")
    .all() as { document_id: string; target_type: DocumentTargetType; target_id: string }[];
  const byDocument = new Map<string, DocumentLink[]>();
  for (const link of links) {
    const list = byDocument.get(link.document_id) ?? [];
    list.push({ targetType: link.target_type, targetId: link.target_id });
    byDocument.set(link.document_id, list);
  }
  return rows.map((row) => ({ ...rowToSummary(row), links: byDocument.get(row.id) ?? [] }));
}

/** Only the given ids the caller may read, in the given order. */
export function getDocumentsByIds(userId: string, isAdmin: boolean, ids: string[]): DocumentRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, d.text_content FROM documents d
       LEFT JOIN users u ON u.id = d.user_id WHERE d.id IN (${placeholders})`,
    )
    .all(...ids) as DocumentRow[];
  const byId = new Map(
    rows
      .filter((row) => isAdmin || row.user_id === userId)
      .map((row) => [row.id, { ...rowToSummary(row), textContent: row.text_content ?? "" }]),
  );
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export function renameDocument(userId: string, isAdmin: boolean, id: string, title: string): boolean {
  if (!getDocument(userId, isAdmin, id)) return false;
  getDb().prepare("UPDATE documents SET title = ? WHERE id = ?").run(title, id);
  return true;
}

export function getDocument(userId: string, isAdmin: boolean, id: string): DocumentRecord | null {
  const row = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, d.text_content FROM documents d
       LEFT JOIN users u ON u.id = d.user_id WHERE d.id = ?`,
    )
    .get(id) as DocumentRow | undefined;
  if (!row || (!isAdmin && row.user_id !== userId)) return null;
  return { ...rowToSummary(row), textContent: row.text_content ?? "" };
}

/** Deletes the document and its links; returns the stored file id to clean up, if any. */
export function deleteDocument(userId: string, isAdmin: boolean, id: string): string | null {
  const doc = getDocument(userId, isAdmin, id);
  if (!doc) return null;
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM document_links WHERE document_id = ?").run(id);
    db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  })();
  return doc.fileId ?? null;
}

export function listLinkedDocuments(
  targetType: DocumentTargetType,
  targetId: string,
): DocumentRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, d.text_content FROM document_links l
       JOIN documents d ON d.id = l.document_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE l.target_type = ? AND l.target_id = ?
       ORDER BY l.created_at`,
    )
    .all(targetType, targetId) as DocumentRow[];
  return rows.map((row) => ({ ...rowToSummary(row), textContent: row.text_content ?? "" }));
}

/** Replaces the documents attached to a skill/project with `documentIds`. */
export function setLinkedDocuments(
  targetType: DocumentTargetType,
  targetId: string,
  documentIds: string[],
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO document_links (document_id, target_type, target_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare("DELETE FROM document_links WHERE target_type = ? AND target_id = ?").run(
      targetType,
      targetId,
    );
    const now = new Date().toISOString();
    for (const documentId of documentIds) insert.run(documentId, targetType, targetId, now);
  })();
}

export function linkDocument(
  documentId: string,
  targetType: DocumentTargetType,
  targetId: string,
): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO document_links (document_id, target_type, target_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(documentId, targetType, targetId, new Date().toISOString());
}

/** Replaces the skills/projects one document is attached to. */
export function setDocumentTargets(documentId: string, links: DocumentLink[]): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO document_links (document_id, target_type, target_id, created_at)
     VALUES (?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare("DELETE FROM document_links WHERE document_id = ?").run(documentId);
    const now = new Date().toISOString();
    for (const link of links) insert.run(documentId, link.targetType, link.targetId, now);
  })();
}

/** The skills/projects a document is attached to. */
export function listDocumentTargets(
  documentId: string,
): { targetType: DocumentTargetType; targetId: string }[] {
  return (
    getDb()
      .prepare("SELECT target_type, target_id FROM document_links WHERE document_id = ?")
      .all(documentId) as { target_type: DocumentTargetType; target_id: string }[]
  ).map((row) => ({ targetType: row.target_type, targetId: row.target_id }));
}
