import type {
  TrainingCandidate,
  TrainingSourceKind,
} from "../../../../shared/types.js";
import { getDb } from "../../../services/db/client.js";
import { getScriptAnalysisById } from "../../script/repo.js";
import type { TrainingSource } from "./types.js";

/** Shorter scripts say too little about how their author writes. */
export const MIN_SCRIPT_CHARS = 150;

interface VersionRow {
  id: string;
  created_at: string;
  source_url: string | null;
  script_text: string;
  scenes_json: string;
  approved: number;
  video_id: string | null;
  video_name: string | null;
  category_name: string | null;
  project_name: string | null;
}

/** Approved beats analyzed beats draft; among equals, the newest wins. */
function rank(row: VersionRow): number {
  const analyzed = (JSON.parse(row.scenes_json) as unknown[]).length > 0;
  return row.approved === 1 ? 2 : analyzed ? 1 : 0;
}

function titleOf(
  row: Pick<VersionRow, "video_name" | "source_url">,
  fallback: string,
): string {
  return row.video_name || row.source_url || fallback;
}

/**
 * A training source over saved script versions of one kind (scripts fetched from
 * a link, transcribed from an upload…). New ones are made on the training page
 * through the script step's own endpoints, which save a version; the version id
 * is what gets picked and recorded.
 *
 * The same script often has several versions (draft, analyzed, approved): the
 * list offers one per video — or per link/file when it belongs to no video.
 */
function scriptVersionSource(options: {
  kind: TrainingSourceKind;
  noun: string;
  /** SQL condition on `sa` (script_analyses) selecting this kind's versions. */
  where: string;
  untitled: string;
}): TrainingSource {
  const select = `
    SELECT sa.id, sa.created_at, sa.source_url, sa.script_text, sa.scenes_json, sa.approved,
           sa.video_id, v.name AS video_name, c.name AS category_name, p.name AS project_name
    FROM script_analyses sa
    LEFT JOIN videos v ON v.id = sa.video_id
    LEFT JOIN categories c ON c.id = v.category_id
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE (${options.where})
      AND length(trim(sa.script_text)) >= ${MIN_SCRIPT_CHARS}
      AND (sa.video_id IS NULL
           OR (v.deleted_at IS NULL AND c.deleted_at IS NULL AND p.deleted_at IS NULL))
  `;

  return {
    kind: options.kind,
    noun: options.noun,
    max: 12,

    listCandidates(caller) {
      const rows = getDb()
        .prepare(`${select} AND sa.user_id = ? ORDER BY sa.created_at DESC`)
        .all(caller.id) as VersionRow[];

      const best = new Map<string, VersionRow>();
      for (const row of rows) {
        const key = row.video_id ?? row.source_url ?? row.id;
        const current = best.get(key);
        if (!current || rank(row) > rank(current)) best.set(key, row);
      }

      return [...best.values()].map((row): TrainingCandidate => ({
        kind: options.kind,
        id: row.id,
        title: titleOf(row, options.untitled),
        group: row.project_name
          ? `${row.project_name} › ${row.category_name}`
          : "",
        excerpt: row.script_text.trim().slice(0, 200),
        charCount: row.script_text.trim().length,
        badges: [
          rank(row) === 2 ? "approved" : rank(row) === 1 ? "analyzed" : "",
        ].filter(Boolean),
        videoId: row.video_id ?? undefined,
      }));
    },

    load(caller, ids) {
      const isAdmin = caller.role === "admin";
      const meta = getDb().prepare(`${select} AND sa.id = ?`);
      return [...new Set(ids)].flatMap((id) => {
        const row = meta.get(id) as VersionRow | undefined;
        // Access goes through the script repo (owner, or any for admins).
        const version = row
          ? getScriptAnalysisById(caller.id, isAdmin, id)
          : null;
        if (!row || !version) return [];
        return [
          {
            kind: options.kind,
            id,
            title: titleOf(row, options.untitled),
            text: version.scriptText.trim(),
            role: "sample" as const,
            scenes: version.scenes,
          },
        ];
      });
    },

    labels(caller, ids) {
      return new Map(
        this.load(caller, ids).map((material) => [material.id, material.title]),
      );
    },
  };
}

/** Scripts fetched from a video link (YouTube, TikTok…), in the training page or the studio. */
export const linkSource = scriptVersionSource({
  kind: "link",
  noun: "link video",
  where: "sa.source_type = 'youtube'",
  untitled: "Video từ link",
});

/** Scripts transcribed from an uploaded video file (they keep its extracted frames). */
export const uploadSource = scriptVersionSource({
  kind: "upload",
  noun: "video tải lên",
  where: "sa.source_type = 'import' AND sa.frames_json NOT IN ('', '[]')",
  untitled: "Video tải lên",
});
