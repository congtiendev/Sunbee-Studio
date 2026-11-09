import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { dataDir } from "../../env.js";
import { getDb } from "../db/client.js";
import type { StoredFile, StoredFileKind } from "../../../shared/types.js";

/**
 * Binary storage for user uploads (documents, library assets, skill
 * attachments). Files live under `<dataDir>/files/<userId>/<fileId>` and
 * their metadata in the `files` table. Swap this module out to move storage
 * elsewhere (S3, ...): callers only use these functions.
 */

interface FileRow {
  id: string;
  user_id: string;
  kind: StoredFileKind;
  original_name: string;
  mime: string;
  size: number;
  sha256: string;
  path: string;
  created_at: string;
}

function filesRoot(): string {
  return join(dataDir(), "files");
}

function rowToFile(row: FileRow): StoredFile {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    originalName: row.original_name,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export async function saveFile(
  userId: string,
  kind: StoredFileKind,
  buffer: Buffer,
  originalName: string,
  mime: string,
): Promise<StoredFile> {
  const id = randomUUID();
  const dir = join(filesRoot(), userId);
  mkdirSync(dir, { recursive: true });
  const relativePath = join(userId, id);
  await writeFile(join(filesRoot(), relativePath), buffer);

  const row: FileRow = {
    id,
    user_id: userId,
    kind,
    original_name: originalName,
    mime: mime || "application/octet-stream",
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    path: relativePath,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO files (id, user_id, kind, original_name, mime, size, sha256, path, created_at)
       VALUES (@id, @user_id, @kind, @original_name, @mime, @size, @sha256, @path, @created_at)`,
    )
    .run(row);
  return rowToFile(row);
}

function findRow(id: string): FileRow | undefined {
  return getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as FileRow | undefined;
}

/** The file if `userId` owns it (admins may read anyone's), else null. */
export function getFileForUser(
  userId: string,
  isAdmin: boolean,
  id: string,
): (StoredFile & { absolutePath: string }) | null {
  const row = findRow(id);
  if (!row || (!isAdmin && row.user_id !== userId)) return null;
  const root = resolve(filesRoot());
  const absolutePath = resolve(root, row.path);
  // Defence in depth: never serve anything outside the files root.
  if (!absolutePath.startsWith(root + sep)) return null;
  return { ...rowToFile(row), absolutePath };
}

export async function deleteFile(userId: string, isAdmin: boolean, id: string): Promise<void> {
  const file = getFileForUser(userId, isAdmin, id);
  if (!file) return;
  await rm(file.absolutePath, { force: true });
  getDb().prepare("DELETE FROM files WHERE id = ?").run(id);
}
