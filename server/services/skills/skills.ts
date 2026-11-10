import type {
  DocumentSummary,
  ScriptAnalysisRecord,
  ScriptAnalysisSummary,
  SkillDetail,
  SkillInput,
  SkillUpdateRequest,
  User,
} from "../../../shared/types.js";
import { getScriptAnalysesByIds } from "../../modules/script/repo.js";
import { getDb } from "../db/client.js";
import {
  getDocumentsByIds,
  listLinkedDocuments,
  setLinkedDocuments,
} from "../db/documents-repo.js";
import {
  getTemplateById,
  listSkillExampleIds,
  setSkillExamples,
  updateTemplate,
} from "../db/style-templates-repo.js";

export type Caller = Pick<User, "id" | "role">;

const isAdmin = (caller: Caller) => caller.role === "admin";

export function summarizeAnalysis(record: ScriptAnalysisRecord): ScriptAnalysisSummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    scriptExcerpt: record.scriptText.slice(0, 200),
    sceneCount: record.scenes.length,
    genre: record.style?.genre,
    videoId: record.videoId,
    approved: Boolean(record.approved),
  };
}

function summarizeDocument(doc: DocumentSummary): DocumentSummary {
  const { id, title, mime, charCount, fileId, createdAt, ownerEmail } = doc;
  return { id, title, mime, charCount, fileId, createdAt, ownerEmail };
}

export function getSkillExamples(caller: Caller, skillId: string): ScriptAnalysisRecord[] {
  return getScriptAnalysesByIds(caller.id, isAdmin(caller), listSkillExampleIds(skillId));
}

export function videoNameOf(videoId: string): string | undefined {
  const row = getDb().prepare("SELECT name FROM videos WHERE id = ?").get(videoId) as
    | { name: string }
    | undefined;
  return row?.name;
}

export function getSkillDetail(caller: Caller, id: string): SkillDetail | null {
  const skill = getTemplateById(caller.id, isAdmin(caller), id);
  if (!skill) return null;
  return {
    ...skill,
    examples: getSkillExamples(caller, id).map(summarizeAnalysis),
    documents: listLinkedDocuments("skill", id).map(summarizeDocument),
  };
}

export function updateSkill(
  caller: Caller,
  id: string,
  req: SkillUpdateRequest,
): SkillDetail | null {
  const { exampleIds, documentIds, ...fields } = req;
  const updated = updateTemplate(caller.id, isAdmin(caller), id, fields);
  if (!updated) return null;
  if (exampleIds) {
    // Only keep versions the caller can actually read.
    const allowed = getScriptAnalysesByIds(caller.id, isAdmin(caller), exampleIds).map((r) => r.id);
    setSkillExamples(id, allowed);
  }
  if (documentIds) {
    const allowed = getDocumentsByIds(caller.id, isAdmin(caller), documentIds).map((d) => d.id);
    setLinkedDocuments("skill", id, allowed);
  }
  return getSkillDetail(caller, id);
}

/** The project a video belongs to (video → category → project). */
export function projectIdForVideo(videoId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT c.project_id FROM videos v JOIN categories c ON c.id = v.category_id WHERE v.id = ?`,
    )
    .get(videoId) as { project_id: string } | undefined;
  return row?.project_id ?? null;
}

/** Fills the style fields a skill may not have (hand-made or Agent Skills). */
export function withSkillDefaults(input: Partial<SkillInput> & { name: string }): SkillInput {
  return {
    ...input,
    name: input.name.trim(),
    type: input.type ?? "script",
    genre: input.genre ?? "",
    styleTags: input.styleTags ?? [],
    toneDescription: input.toneDescription ?? "",
    pacing: input.pacing ?? { avgShotLengthSec: 0, cutsPerMinute: 0 },
    resourceInventory: input.resourceInventory ?? {},
  };
}
