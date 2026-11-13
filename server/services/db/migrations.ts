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
  {
    id: 9,
    name: "missing_owner_indexes",
    up: (db) => {
      db.exec(`
        -- script_analyses had no indexes at all: every history/by-id lookup
        -- (user's own or admin's) scanned the full table, including the
        -- frames_json/script_text blobs of every row.
        CREATE INDEX idx_script_analyses_user ON script_analyses(user_id);
        CREATE INDEX idx_script_analyses_video ON script_analyses(video_id);
        CREATE INDEX idx_script_analyses_kind ON script_analyses(kind, user_id);

        CREATE INDEX idx_projects_user ON projects(user_id);
        CREATE INDEX idx_categories_user ON categories(user_id);
        CREATE INDEX idx_style_templates_user ON style_templates(user_id);
      `);
    },
  },
  {
    id: 10,
    name: "character_roster",
    up: (db) => {
      db.exec(`
        -- Recurring characters (appear in 2+ scenes) with a locked appearance
        -- description, so independent image generations of the same person
        -- across scenes start from the same wording instead of improvising.
        ALTER TABLE script_analyses ADD COLUMN character_roster_json TEXT;
      `);
    },
  },
  {
    id: 11,
    name: "skill_graphics_style",
    up: (db) => {
      db.exec(`
        -- A skill is now exactly one type: "script" (instructions/examples/pacing,
        -- used in the Script step) or "image" (graphics_style, used in the Assets
        -- step). Existing skills default to "script" (they're all script-purpose
        -- today). graphics_style is a skill's art-style methodology, folded into
        -- every image-gen prompt so a whole video's generated art stays consistent.
        ALTER TABLE style_templates ADD COLUMN type TEXT NOT NULL DEFAULT 'script';
        ALTER TABLE style_templates ADD COLUMN graphics_style TEXT;
      `);
    },
  },
  {
    id: 12,
    name: "skill_reference_image",
    up: (db) => {
      db.exec(`
        -- type "image" skills: an optional reference illustration (style.
        -- not content, described into the prompt like graphics_style).
        -- Stored as a files.id, set only via the dedicated upload endpoint.
        ALTER TABLE style_templates ADD COLUMN reference_image_file_id TEXT;
      `);
    },
  },
  {
    id: 13,
    name: "training_images",
    up: (db) => {
      db.exec(`
        -- A user's reusable library of example images for training an "image"
        -- skill (AI reads them and writes graphicsStyle), mirroring how the
        -- document library backs the "document" training source.
        CREATE TABLE training_images (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          file_id TEXT NOT NULL REFERENCES files(id),
          title TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_training_images_user ON training_images(user_id);
      `);
    },
  },
  {
    id: 14,
    name: "skill_reference_images_list",
    up: (db) => {
      // Up to 10 reference illustrations per image skill, replacing the single
      // reference_image_file_id — carries forward any existing single value.
      db.exec(`ALTER TABLE style_templates ADD COLUMN reference_image_files_json TEXT;`);
      const rows = db
        .prepare(
          `SELECT id, reference_image_file_id FROM style_templates WHERE reference_image_file_id IS NOT NULL`,
        )
        .all() as { id: string; reference_image_file_id: string }[];
      const update = db.prepare(
        `UPDATE style_templates SET reference_image_files_json = ? WHERE id = ?`,
      );
      for (const row of rows) {
        update.run(JSON.stringify([row.reference_image_file_id]), row.id);
      }
    },
  },
  {
    id: 15,
    name: "script_analysis_style_template",
    up: (db) => {
      // Which skill was selected when writing/analyzing this version, so a
      // page refresh (which reloads the newest draft/analyzed version) also
      // restores the chosen skill instead of resetting it to "none".
      db.exec(`ALTER TABLE script_analyses ADD COLUMN style_template_id TEXT;`);
    },
  },
  {
    id: 16,
    name: "skill_editing_style",
    up: (db) => {
      // A 3rd skill type: "editing" (shot size, camera movement, cut rhythm,
      // scene transitions), used by the scene-breakdown (analyze) step
      // independently of the "script" (voice/writing) skill.
      db.exec(`ALTER TABLE style_templates ADD COLUMN editing_style TEXT;`);
    },
  },
  {
    id: 17,
    name: "script_analysis_editing_style_template",
    up: (db) => {
      // The type "editing" skill selected when analyzing this version, so it
      // also survives a page refresh, mirroring style_template_id above.
      db.exec(`ALTER TABLE script_analyses ADD COLUMN editing_style_template_id TEXT;`);
    },
  },
  {
    id: 18,
    name: "script_analysis_provider_model_language",
    up: (db) => {
      // Records which AI provider/model/script language produced this
      // version, so versions can be compared side by side in history.
      db.exec(`ALTER TABLE script_analyses ADD COLUMN provider TEXT;`);
      db.exec(`ALTER TABLE script_analyses ADD COLUMN model TEXT;`);
      db.exec(`ALTER TABLE script_analyses ADD COLUMN language TEXT;`);
    },
  },
  {
    id: 19,
    name: "script_analysis_object_roster",
    up: (db) => {
      // Same idea as character_roster_json (migration 10), but for recurring
      // objects/props (a character's signature item, a brand logo...) so
      // their look also stays consistent across every scene's image-gen
      // prompt instead of each generation improvising a different one.
      db.exec(`ALTER TABLE script_analyses ADD COLUMN object_roster_json TEXT;`);
    },
  },
  {
    id: 20,
    name: "asset_prompts",
    up: (db) => {
      // AI-written image prompts for a video's required assets (the batch
      // "generate via ChatGPT" dialog), saved as soon as each is written so
      // they survive closing the dialog, a reload, or picking another scene
      // range. Keyed by the asset's normalized description — the same key the
      // dialog dedupes on — so they follow the asset, not a p1/p2 code.
      db.exec(`
        CREATE TABLE asset_prompts (
          video_id TEXT NOT NULL,
          description_key TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id),
          description TEXT NOT NULL,
          prompt TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (video_id, description_key)
        );
      `);
    },
  },
  {
    id: 21,
    name: "video_frame_ratio",
    up: (db) => {
      // One frame shape per video ("16:9", "9:16", "1:1", "4:3"; NULL = never
      // picked, treated as 16:9) that every image made for it composes for —
      // and the one each saved prompt was written for, so a prompt for
      // another shape isn't reused.
      db.exec(`
        ALTER TABLE videos ADD COLUMN frame_ratio TEXT;
        ALTER TABLE asset_prompts ADD COLUMN frame_ratio TEXT;
      `);
    },
  },
  {
    id: 22,
    name: "asset_prompt_layer",
    up: (db) => {
      // Whether a saved prompt draws a whole frame of the scene ("scene") or
      // just its subject for a transparent PNG to composite and animate
      // ("cutout") — see `ImageLayer`.
      db.exec(`ALTER TABLE asset_prompts ADD COLUMN layer TEXT;`);
    },
  },
  {
    id: 23,
    name: "asset_prompt_rules_version",
    up: (db) => {
      // Which version of the prompt-writing rules wrote each saved prompt
      // (IMAGE_PROMPT_RULES_VERSION) — prompts from older rules aren't reused.
      db.exec(`ALTER TABLE asset_prompts ADD COLUMN rules_version INTEGER;`);
    },
  },
  {
    id: 24,
    name: "backup_import_records",
    up: (db) => {
      // Maps a bundle record's ORIGINAL id (from the account it was exported
      // from) to the new row importBundle() created for it, so re-importing
      // the same backup (or a newer backup that overlaps an older one) skips
      // records already imported instead of creating duplicates.
      db.exec(`
        CREATE TABLE import_records (
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          original_id TEXT NOT NULL,
          record_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, kind, original_id)
        );
      `);
    },
  },
  {
    id: 25,
    name: "voice_profiles",
    up: (db) => {
      // A reusable voice, cloned from one reference sample (stored via the
      // `files` service) — the local TTS sidecar re-reads the sample at
      // synthesis time, so no separate "clone" step/id is kept here.
      db.exec(`
        CREATE TABLE voice_profiles (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          engine TEXT NOT NULL,
          sample_file_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_voice_profiles_user ON voice_profiles(user_id);
      `);
    },
  },
  {
    id: 26,
    name: "voice_profile_preset",
    up: (db) => {
      // Which catalog preset (presets.ts) a profile was installed from, if
      // any — lets the library show "Installed" instead of "Install" and
      // skip creating a duplicate profile for the same preset.
      db.exec(`ALTER TABLE voice_profiles ADD COLUMN preset_id TEXT;`);
    },
  },
  {
    id: 27,
    name: "voice_profile_piper",
    up: (db) => {
      // A Piper-engine profile has no reference sample to clone — it reads
      // with a fixed, pre-trained speaker instead (piper_model + optional
      // piper_speaker_id). sample_file_id must become nullable for that, and
      // SQLite can't drop a NOT NULL via ALTER, so the table is rebuilt.
      db.exec(`
        CREATE TABLE voice_profiles_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          engine TEXT NOT NULL,
          sample_file_id TEXT,
          created_at TEXT NOT NULL,
          preset_id TEXT,
          piper_model TEXT,
          piper_speaker_id INTEGER
        );
        INSERT INTO voice_profiles_new (id, user_id, name, engine, sample_file_id, created_at, preset_id)
          SELECT id, user_id, name, engine, sample_file_id, created_at, preset_id FROM voice_profiles;
        DROP TABLE voice_profiles;
        ALTER TABLE voice_profiles_new RENAME TO voice_profiles;
        CREATE INDEX idx_voice_profiles_user ON voice_profiles(user_id);
      `);
    },
  },
  {
    id: 28,
    name: "voice_profile_vieneu",
    up: (db) => {
      // Switched the local engine from Piper to VieNeu-TTS (one engine for
      // both built-in voices and cloning — see server/services/voice/python/
      // engine.py). piper_model/piper_speaker_id are gone; preset_voice_id
      // holds a built-in voice's name (see vieneu-presets.ts) instead.
      db.exec(`
        CREATE TABLE voice_profiles_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          engine TEXT NOT NULL,
          sample_file_id TEXT,
          created_at TEXT NOT NULL,
          preset_id TEXT,
          preset_voice_id TEXT
        );
        INSERT INTO voice_profiles_new (id, user_id, name, engine, sample_file_id, created_at, preset_id)
          SELECT id, user_id, name, engine, sample_file_id, created_at, preset_id FROM voice_profiles;
        DROP TABLE voice_profiles;
        ALTER TABLE voice_profiles_new RENAME TO voice_profiles;
        CREATE INDEX idx_voice_profiles_user ON voice_profiles(user_id);
      `);
    },
  },
  {
    id: 29,
    name: "asset_category",
    up: (db) => {
      // Folder-like grouping for library assets, mainly for sound-effect
      // packs (see server/modules/assets/sound-effects/) — a pack installs
      // as many assets sharing one category + source_pack_id (so a second
      // install of the same pack is a no-op instead of duplicating rows).
      db.exec(`
        ALTER TABLE assets ADD COLUMN category TEXT;
        ALTER TABLE assets ADD COLUMN source_pack_id TEXT;
        CREATE INDEX idx_assets_source_pack ON assets(user_id, source_pack_id);
      `);
    },
  },
  {
    id: 30,
    name: "video_render_tables",
    up: (db) => {
      // The standalone video-render tool's timeline for a video (one current
      // manifest per video, unlike script's versioned drafts — see
      // server/modules/video-render/) and its render output history
      // (append-only; the rendered file itself lives in the files table,
      // kind "render").
      db.exec(`
        CREATE TABLE edit_plans (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          video_id TEXT NOT NULL UNIQUE,
          script_version_id TEXT NOT NULL,
          manifest_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE video_renders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          video_id TEXT NOT NULL,
          file_id TEXT NOT NULL REFERENCES files(id),
          manifest_json TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_video_renders_video ON video_renders(video_id, created_at);
      `);
    },
  },
  {
    id: 31,
    name: "render_projects",
    up: (db) => {
      // The video-render module became self-contained: its own projects
      // (script, scenes, images, audio) instead of a timeline built from a
      // Video Studio video. Migration 30's tables only ever held test data.
      db.exec(`
        DROP TABLE IF EXISTS edit_plans;
        DROP TABLE IF EXISTS video_renders;

        CREATE TABLE render_projects (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          name TEXT NOT NULL,
          frame_ratio TEXT NOT NULL,
          source_mode TEXT NOT NULL DEFAULT 'script',
          idea_text TEXT NOT NULL DEFAULT '',
          target_duration_sec INTEGER,
          script_text TEXT NOT NULL DEFAULT '',
          scenes_json TEXT NOT NULL DEFAULT '[]',
          audio_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX idx_render_projects_user ON render_projects(user_id, updated_at);

        CREATE TABLE render_outputs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          project_id TEXT NOT NULL REFERENCES render_projects(id) ON DELETE CASCADE,
          file_id TEXT NOT NULL REFERENCES files(id),
          manifest_json TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX idx_render_outputs_project ON render_outputs(project_id, created_at);
      `);
    },
  },
  {
    id: 32,
    name: "render_project_source_options",
    up: (db) => {
      // The Video Studio's script sources (link, upload, document, template…)
      // came to the video-render module; each project remembers its inputs.
      db.exec(`ALTER TABLE render_projects ADD COLUMN source_options_json TEXT NOT NULL DEFAULT '{}';`);
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
