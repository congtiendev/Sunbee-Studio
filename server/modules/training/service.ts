import type {
  SkillDetail,
  SkillInput,
  SkillTrainingRequest,
  SkillTrainingResult,
  SkillType,
  SkillVersion,
  StyleTemplate,
  TrainingSourceRef,
} from "../../../shared/types.js";
import {
  MissingApiKeyError,
  hasProviderKey,
  runTask,
  taskContextFor,
  type TaskContext,
} from "../../services/ai/task.js";
import type { ProviderKey } from "../../services/ai/providers/index.js";
import {
  getTemplateById,
  saveTemplate,
  updateTemplate,
} from "../../services/db/style-templates-repo.js";
import {
  getSkillDetail,
  withSkillDefaults,
  type Caller,
} from "../../services/skills/skills.js";
import { withDigests } from "./digests.js";
import { instructionsOf, measuredPacing, snapshotOf } from "./guide.js";
import {
  countSkillVersions,
  getSkillVersion,
  insertSkillVersion,
  listSkillVersions,
  type SkillVersionRecord,
} from "./repo.js";
import { groupByKind, labelSources, loadMaterials } from "./sources/index.js";
import type { TrainingMaterial } from "./sources/types.js";
import { trainGraphicsStyleTask } from "./tasks/train-graphics-style.js";
import { trainSkillTask } from "./tasks/train-skill.js";

const isAdmin = (caller: Caller) => caller.role === "admin";

function requireSkill(caller: Caller, skillId: string): StyleTemplate {
  const skill = getTemplateById(caller.id, isAdmin(caller), skillId);
  if (!skill) throw new Error("Không tìm thấy skill.");
  return skill;
}

function readDetail(caller: Caller, skillId: string): SkillDetail {
  const detail = getSkillDetail(caller, skillId);
  if (!detail) throw new Error("Không đọc lại được skill.");
  return detail;
}

function toVersion(caller: Caller, record: SkillVersionRecord): SkillVersion {
  return { ...record, sources: labelSources(caller, record.sources) };
}

const refKey = (ref: TrainingSourceRef) => `${ref.kind}:${ref.id}`;

/**
 * What a run learns from. New skill: the picked material. Existing skill
 * (cumulative training): everything it learned before — the latest version's
 * sources, minus any the user removed — plus the newly picked material, each
 * marked so the AI merges new evidence into the current guide instead of
 * concluding from the new material alone.
 */
function materialsFor(
  caller: Caller,
  existing: StyleTemplate | null,
  req: SkillTrainingRequest,
): TrainingMaterial[] {
  const removed = new Set((req.removeSources ?? []).map(refKey));
  const learnedRefs = existing
    ? (listSkillVersions(existing.id)[0]?.sources ?? [])
        .filter((ref) => !removed.has(refKey(ref)))
        .map(({ kind, id }) => ({ kind, id }))
    : [];
  const learnedKeys = new Set(learnedRefs.map(refKey));
  const newRefs = (Array.isArray(req.sources) ? req.sources : []).filter(
    (ref) => !learnedKeys.has(refKey(ref)),
  );

  const added = loadMaterials(caller, newRefs).map((m) => ({
    ...m,
    isNew: true,
  }));
  // Gone or unreadable ones simply drop out of the skill's sources from now on.
  const learned = loadMaterials(caller, learnedRefs, {
    enforceLimit: false,
  }).map((m) => ({
    ...m,
    isNew: false,
  }));
  return [...learned, ...added];
}

/**
 * Image-skill training: unlike text training, a refine run does NOT resend
 * every previously-learned image's bytes to the AI each time — the skill's
 * current `graphicsStyle` already distills what those taught it, and
 * re-reading/re-encoding a growing image library on every run would scale
 * cost for no benefit the text summary doesn't already give. Only this run's
 * newly-picked images are read and analyzed; `currentGraphicsStyle` carries
 * everything learned before. Learned/removed sources are still recorded in
 * the version for provenance.
 */
async function runImageTraining(
  caller: Caller,
  req: SkillTrainingRequest,
  existing: StyleTemplate | null,
  provider: ProviderKey,
  ctx: TaskContext,
): Promise<SkillTrainingResult> {
  const removed = new Set((req.removeSources ?? []).map(refKey));
  const learnedRefs = existing
    ? (listSkillVersions(existing.id)[0]?.sources ?? [])
        .filter((ref) => !removed.has(refKey(ref)))
        .map(({ kind, id }) => ({ kind, id }))
    : [];
  const learnedKeys = new Set(learnedRefs.map(refKey));
  const newRefs = (Array.isArray(req.sources) ? req.sources : [])
    .filter((ref) => ref.kind === "image" && !learnedKeys.has(refKey(ref)));

  if (newRefs.length === 0 && !existing?.graphicsStyle?.trim()) {
    throw new Error("Hãy chọn ít nhất một ảnh mẫu.");
  }

  let fields: Partial<SkillInput> = { type: "image" };
  if (newRefs.length > 0) {
    const images = loadMaterials(caller, newRefs).flatMap((m) => m.images ?? []);
    if (images.length === 0) throw new Error("Không đọc được ảnh nào đã chọn.");
    const output = await runTask(
      trainGraphicsStyleTask,
      {
        images,
        currentGraphicsStyle: existing?.graphicsStyle,
        provider,
        model: req.model,
        effort: req.effort,
      },
      ctx,
    );
    fields = { type: "image", graphicsStyle: output.graphicsStyle };
  }
  // No new images: nothing to learn this run — keep graphicsStyle as-is
  // (e.g. the user only dropped a learned source).

  const skill = existing
    ? updateTemplate(caller.id, isAdmin(caller), existing.id, fields)
    : saveTemplate(
        caller.id,
        withSkillDefaults({ name: req.name?.trim() || "Skill mới", ...fields }),
      );
  if (!skill) throw new Error("Không lưu được skill.");

  if (existing && countSkillVersions(existing.id) === 0) {
    insertSkillVersion({
      skillId: existing.id,
      userId: caller.id,
      kind: "snapshot",
      note: "Trước lần huấn luyện đầu tiên",
      snapshot: snapshotOf(existing),
    });
  }

  const version = insertSkillVersion({
    skillId: skill.id,
    userId: caller.id,
    kind: "train",
    note: req.note,
    snapshot: snapshotOf(skill),
    sources: [
      ...learnedRefs.map((ref) => ({ ...ref, added: false })),
      ...newRefs.map((ref) => ({ ...ref, added: true })),
    ],
    provider,
    model: req.model,
  });

  return {
    skill: readDetail(caller, skill.id),
    version: toVersion(caller, version),
  };
}

/**
 * One training run: gather the material (cumulatively for an existing skill),
 * let the AI write a complete guide (voice, structure, visual style, knowledge)
 * — merged with the current guide when refining — then save the skill. Every run
 * is a new version recording the skill's full set of sources and what it added.
 */
export async function runSkillTraining(
  caller: Caller,
  req: SkillTrainingRequest,
): Promise<SkillTrainingResult> {
  const provider = req.provider ?? "claude";
  const ctx = taskContextFor(caller.id);
  if (!hasProviderKey(ctx, provider)) throw new MissingApiKeyError(provider);

  const existing = req.skillId ? requireSkill(caller, req.skillId) : null;
  const targetType: SkillType = existing?.type ?? req.type ?? "script";
  if (targetType === "image") {
    return runImageTraining(caller, req, existing, provider, ctx);
  }

  const materials = materialsFor(caller, existing, req);
  if (materials.length === 0) {
    throw new Error(
      "Hãy chọn ít nhất một video có kịch bản hoặc một tài liệu.",
    );
  }

  // A skill made before training (by hand, imported…) keeps its original state as
  // a version, so the first run can be undone.
  if (existing && countSkillVersions(existing.id) === 0) {
    insertSkillVersion({
      skillId: existing.id,
      userId: caller.id,
      kind: "snapshot",
      note: "Trước lần huấn luyện đầu tiên",
      snapshot: snapshotOf(existing),
    });
  }

  // Long material is read in full first (part by part, cached), so the training
  // call gets notes on every source instead of truncated text.
  const prepared = await withDigests(materials, ctx, {
    provider,
    model: req.model,
  });

  const output = await runTask(
    trainSkillTask,
    {
      materials: prepared,
      currentGuide: existing?.instructions,
      provider,
      model: req.model,
      effort: req.effort,
    },
    ctx,
  );

  const fields = {
    description: output.description.trim() || existing?.description || "",
    genre: output.genre.trim() || existing?.genre || "",
    styleTags: output.styleTags.map((tag) => tag.trim()).filter(Boolean),
    toneDescription:
      output.toneDescription.trim() || existing?.toneDescription || "",
    instructions: instructionsOf(output, materials),
    ...measuredPacing(materials),
  };
  const skill = existing
    ? updateTemplate(caller.id, isAdmin(caller), existing.id, fields)
    : saveTemplate(
        caller.id,
        withSkillDefaults({
          name: req.name?.trim() || output.name.trim() || "Skill mới",
          ...fields,
        }),
      );
  if (!skill) throw new Error("Không lưu được skill.");

  if (req.attachToSkill) {
    const addedRefs = materials
      .filter((m) => m.isNew)
      .map(({ kind, id }) => ({ kind, id }));
    for (const [source, ids] of groupByKind(addedRefs)) {
      source.attachToSkill?.(caller, skill.id, ids);
    }
  }

  const version = insertSkillVersion({
    skillId: skill.id,
    userId: caller.id,
    kind: "train",
    note: req.note,
    snapshot: snapshotOf(skill),
    sources: materials.map(({ kind, id, isNew }) => ({
      kind,
      id,
      added: isNew,
    })),
    provider,
    model: req.model,
  });

  return {
    skill: readDetail(caller, skill.id),
    version: toVersion(caller, version),
  };
}

/** A skill's versions, newest first. */
export function listVersionsOfSkill(
  caller: Caller,
  skillId: string,
): SkillVersion[] {
  requireSkill(caller, skillId);
  return listSkillVersions(skillId).map((record) => toVersion(caller, record));
}

/** Makes an older version the skill's current state again, recorded as a new version. */
export function restoreSkillVersion(
  caller: Caller,
  skillId: string,
  versionId: string,
): SkillTrainingResult {
  requireSkill(caller, skillId);
  const target = getSkillVersion(skillId, versionId);
  if (!target) throw new Error("Không tìm thấy phiên bản này.");

  const skill = updateTemplate(
    caller.id,
    isAdmin(caller),
    skillId,
    target.snapshot,
  );
  if (!skill) throw new Error("Không khôi phục được skill.");
  const version = insertSkillVersion({
    skillId,
    userId: caller.id,
    kind: "restore",
    note: `Khôi phục từ v${target.version}`,
    snapshot: snapshotOf(skill),
    // Same sources as the restored version; a restore adds nothing new.
    sources: target.sources.map(({ kind, id }) => ({ kind, id })),
    provider: target.provider,
    model: target.model,
  });
  return {
    skill: readDetail(caller, skillId),
    version: toVersion(caller, version),
  };
}
