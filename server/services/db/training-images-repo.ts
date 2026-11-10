import { randomUUID } from "node:crypto";
import { getDb } from "./client.js";

/** A user's reusable library of example images for training an "image" skill. */
export interface TrainingImageRecord {
  id: string;
  userId: string;
  fileId: string;
  title: string;
  createdAt: string;
}

interface TrainingImageRow {
  id: string;
  user_id: string;
  file_id: string;
  title: string;
  created_at: string;
}

function rowToRecord(row: TrainingImageRow): TrainingImageRecord {
  return {
    id: row.id,
    userId: row.user_id,
    fileId: row.file_id,
    title: row.title,
    createdAt: row.created_at,
  };
}

export function createTrainingImage(
  userId: string,
  fileId: string,
  title: string,
): TrainingImageRecord {
  const row: TrainingImageRow = {
    id: randomUUID(),
    user_id: userId,
    file_id: fileId,
    title,
    created_at: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO training_images (id, user_id, file_id, title, created_at)
       VALUES (@id, @user_id, @file_id, @title, @created_at)`,
    )
    .run(row);
  return rowToRecord(row);
}

export function listTrainingImages(userId: string, isAdmin: boolean): TrainingImageRecord[] {
  const rows = isAdmin
    ? (getDb().prepare("SELECT * FROM training_images ORDER BY created_at DESC").all() as TrainingImageRow[])
    : (getDb()
        .prepare("SELECT * FROM training_images WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId) as TrainingImageRow[]);
  return rows.map(rowToRecord);
}

/** Only the given ids the caller may read, in the given order. */
export function getTrainingImagesByIds(
  userId: string,
  isAdmin: boolean,
  ids: string[],
): TrainingImageRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(`SELECT * FROM training_images WHERE id IN (${placeholders})`)
    .all(...ids) as TrainingImageRow[];
  const byId = new Map(
    rows.filter((row) => isAdmin || row.user_id === userId).map((row) => [row.id, rowToRecord(row)]),
  );
  return ids.flatMap((id) => byId.get(id) ?? []);
}
