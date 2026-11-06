import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "../../env.js";

let db: Database.Database | null = null;

function resolveDbPath(): string {
  return join(dataDir(), "sunbee.db");
}

function columnExists(
  database: Database.Database,
  table: string,
  column: string,
): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS script_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      script_text TEXT NOT NULL,
      scenes_json TEXT NOT NULL,
      resources_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS style_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      genre TEXT NOT NULL,
      style_tags_json TEXT NOT NULL,
      pacing_json TEXT NOT NULL,
      tone_description TEXT NOT NULL,
      resource_inventory_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  if (!columnExists(database, "script_analyses", "user_id")) {
    database.exec(
      `ALTER TABLE script_analyses ADD COLUMN user_id TEXT REFERENCES users(id)`,
    );
  }
  if (!columnExists(database, "script_analyses", "frames_json")) {
    database.exec(`ALTER TABLE script_analyses ADD COLUMN frames_json TEXT`);
  }
  if (!columnExists(database, "script_analyses", "style_json")) {
    database.exec(`ALTER TABLE script_analyses ADD COLUMN style_json TEXT`);
  }
  if (!columnExists(database, "script_analyses", "kind")) {
    database.exec(
      `ALTER TABLE script_analyses ADD COLUMN kind TEXT NOT NULL DEFAULT 'analyzed'`,
    );
  }
  if (columnExists(database, "script_analyses", "project_id")) {
    database.exec(`ALTER TABLE script_analyses DROP COLUMN project_id`);
  }
  if (!columnExists(database, "script_analyses", "video_id")) {
    database.exec(
      `ALTER TABLE script_analyses ADD COLUMN video_id TEXT REFERENCES videos(id)`,
    );
  }
  if (!columnExists(database, "style_templates", "user_id")) {
    database.exec(
      `ALTER TABLE style_templates ADD COLUMN user_id TEXT REFERENCES users(id)`,
    );
  }
  if (!columnExists(database, "projects", "deleted_at")) {
    database.exec(`ALTER TABLE projects ADD COLUMN deleted_at TEXT`);
  }
  if (!columnExists(database, "categories", "deleted_at")) {
    database.exec(`ALTER TABLE categories ADD COLUMN deleted_at TEXT`);
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = resolveDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  runMigrations(db);
  return db;
}
