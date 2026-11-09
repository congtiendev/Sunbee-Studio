import type Database from "better-sqlite3";

/**
 * Numbered, append-only schema migrations. Each runs once, inside a
 * transaction, and is recorded in `schema_migrations`.
 *
 * The ad-hoc `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE` block in
 * client.ts is the implicit baseline ("migration 0") that existing databases
 * already went through. Never edit or reorder an entry here once it has
 * shipped — add a new one instead.
 */
interface Migration {
  id: number;
  name: string;
  up: (db: Database.Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "prompt_overrides_and_files",
    up: (db) => {
      db.exec(`
        CREATE TABLE prompt_overrides (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK (scope IN ('global', 'user')),
          user_id TEXT NOT NULL DEFAULT '',
          task_key TEXT NOT NULL,
          slot TEXT NOT NULL,
          content TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (scope, user_id, task_key, slot)
        );

        CREATE TABLE files (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          kind TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime TEXT NOT NULL,
          size INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_files_user ON files(user_id);
      `);
    },
  },
  {
    id: 2,
    name: "skills_documents_approved_versions",
    up: (db) => {
      db.exec(`
        -- Skills (still the style_templates table, so MCP tools and old backups keep working).
        ALTER TABLE style_templates ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE style_templates ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
        ALTER TABLE style_templates ADD COLUMN origin TEXT NOT NULL DEFAULT 'app';
        ALTER TABLE style_templates ADD COLUMN skill_md TEXT;
        ALTER TABLE style_templates ADD COLUMN updated_at TEXT;

        -- A version the user reviewed (and possibly edited): usable as a few-shot example.
        ALTER TABLE script_analyses ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;

        CREATE TABLE skill_examples (
          skill_id TEXT NOT NULL,
          script_analysis_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (skill_id, script_analysis_id)
        );

        -- Text documents: uploaded files (text extracted) or text imported with a skill.
        CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          file_id TEXT REFERENCES files(id),
          title TEXT NOT NULL,
          mime TEXT NOT NULL,
          text_content TEXT NOT NULL,
          char_count INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_documents_user ON documents(user_id);

        -- Attaches a document to a skill or a project as reference knowledge.
        CREATE TABLE document_links (
          document_id TEXT NOT NULL,
          target_type TEXT NOT NULL CHECK (target_type IN ('skill', 'project')),
          target_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (document_id, target_type, target_id)
        );
        CREATE INDEX idx_document_links_target ON document_links(target_type, target_id);
      `);
    },
  },
  {
    id: 3,
    name: "script_template_source",
    up: (db) => {
      db.exec(`
        -- Source "template": the analyzed version a new script was modelled on.
        ALTER TABLE script_analyses ADD COLUMN template_source_id TEXT;
      `);
    },
  },
  {
    id: 4,
    name: "asset_library_scene_resources",
    up: (db) => {
      db.exec(`
        -- The user's internal asset library (the binaries live in the files table).
        CREATE TABLE assets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          file_id TEXT NOT NULL REFERENCES files(id),
          media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
          name TEXT NOT NULL,
          tags_json TEXT NOT NULL DEFAULT '[]',
          description TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_assets_user ON assets(user_id);

        -- The asset picked for each required asset of each scene, per video.
        CREATE TABLE scene_resources (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          video_id TEXT NOT NULL,
          scene_index INTEGER NOT NULL,
          asset_index INTEGER NOT NULL,
          asset_description TEXT NOT NULL DEFAULT '',
          source_key TEXT NOT NULL,
          candidate_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (video_id, scene_index, asset_index)
        );
      `);
    },
  },
  {
    id: 5,
    name: "video_soft_delete",
    up: (db) => {
      db.exec(`
        -- Videos are soft-deleted like projects and categories (hidden, data kept).
        ALTER TABLE videos ADD COLUMN deleted_at TEXT;
        CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category_id);
        CREATE INDEX IF NOT EXISTS idx_categories_project ON categories(project_id);
      `);
    },
  },
  {
    id: 6,
    name: "skill_sources",
    up: (db) => {
      db.exec(`
        -- The scripts a skill's voice/style was learned from, so training can be
        -- repeated with more videos (unlike skill_examples, drafts count too).
        CREATE TABLE skill_sources (
          skill_id TEXT NOT NULL,
          script_analysis_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (skill_id, script_analysis_id)
        );
      `);
    },
  },
  {
    id: 7,
    name: "skill_versions",
    up: (db) => {
      db.exec(`
        -- Superseded by skill_versions, which records each training run's sources.
        DROP TABLE IF EXISTS skill_sources;

        -- One row per training run (or restore) of a skill: the full skill as it was
        -- after the run, what it learned from, and with which model.
        -- sources_json: [{ "kind": "script" | "document" | …, "id": "…" }] — generic so
        -- new training source kinds need no schema change.
        CREATE TABLE skill_versions (
          id TEXT PRIMARY KEY,
          skill_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          kind TEXT NOT NULL CHECK (kind IN ('train', 'restore', 'snapshot')),
          note TEXT NOT NULL DEFAULT '',
          snapshot_json TEXT NOT NULL,
          sources_json TEXT NOT NULL DEFAULT '[]',
          provider TEXT,
          model TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (skill_id, version)
        );
        CREATE INDEX idx_skill_versions_skill ON skill_versions(skill_id);
      `);
    },
  },
  {
    id: 8,
    name: "training_digests",
    up: (db) => {
      db.exec(`
        -- AI notes on one training source, read in full (long ones chunk by chunk).
        -- Keyed by a hash of the source text + the digest prompt + the model, so
        -- cumulative training re-uses them instead of re-reading every source.
        CREATE TABLE training_digests (
          key TEXT PRIMARY KEY,
          digest_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    },
  },
];

export function runNumberedMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map(
      (row) => row.id,
    ),
  );
  const record = db.prepare(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      record.run(migration.id, migration.name, new Date().toISOString());
    })();
  }
}
