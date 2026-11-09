import type { DocumentRecord } from "../../../shared/types.js";
import type { ContextInput } from "../../services/ai/context.js";
import { listLinkedDocuments } from "../../services/db/documents-repo.js";
import { getTemplateById } from "../../services/db/style-templates-repo.js";
import {
  getSkillExamples,
  projectIdForVideo,
  type Caller,
} from "../../services/skills/skills.js";

/**
 * Everything a script task should know besides the script itself: the
 * chosen skill (style + instructions), its approved examples, and the
 * reference documents attached to the skill and to the video's project.
 */
export function loadScriptContext(
  caller: Caller,
  { skillId, videoId }: { skillId?: string; videoId?: string },
): ContextInput {
  const skill = skillId
    ? (getTemplateById(caller.id, caller.role === "admin", skillId) ??
      undefined)
    : undefined;

  const documents: DocumentRecord[] = [];
  const seen = new Set<string>();
  const addDocuments = (docs: DocumentRecord[]) => {
    for (const doc of docs) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        documents.push(doc);
      }
    }
  };
  if (skill) addDocuments(listLinkedDocuments("skill", skill.id));
  const projectId = videoId ? projectIdForVideo(videoId) : null;
  if (projectId) addDocuments(listLinkedDocuments("project", projectId));

  return {
    skill,
    examples: skill ? getSkillExamples(caller, skill.id) : [],
    documents,
  };
}
