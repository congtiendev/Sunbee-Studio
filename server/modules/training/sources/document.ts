import type { TrainingCandidate } from "../../../../shared/types.js";
import {
  getDocumentsByIds,
  listDocuments,
  listLinkedDocuments,
} from "../../../services/db/documents-repo.js";
import { updateSkill } from "../../../services/skills/skills.js";
import type { TrainingSource } from "./types.js";

const TYPE_LABELS: [string, string][] = [
  ["pdf", "PDF"],
  ["wordprocessingml", "DOCX"],
  ["markdown", "MD"],
  ["csv", "CSV"],
  ["json", "JSON"],
  ["text/plain", "TXT"],
];

function typeLabel(mime: string): string {
  return TYPE_LABELS.find(([needle]) => mime.includes(needle))?.[1] ?? "";
}

/**
 * Documents from the library: voice/brand guides, sample texts, subject knowledge.
 * They can also be attached to the skill, so script writing keeps consulting them.
 */
export const documentSource: TrainingSource = {
  kind: "document",
  noun: "tài liệu",
  max: 10,

  listCandidates(caller) {
    return listDocuments(caller.id, caller.role === "admin")
      .filter((doc) => doc.charCount > 0)
      .map((doc): TrainingCandidate => ({
        kind: "document",
        id: doc.id,
        title: doc.title,
        group: "",
        excerpt: "",
        charCount: doc.charCount,
        badges: [
          typeLabel(doc.mime),
          ...((doc.links ?? []).some((link) => link.targetType === "skill")
            ? ["linked"]
            : []),
        ].filter(Boolean),
      }));
  },

  load(caller, ids) {
    return getDocumentsByIds(caller.id, caller.role === "admin", [
      ...new Set(ids),
    ])
      .filter((doc) => doc.textContent.trim())
      .map((doc) => ({
        kind: "document" as const,
        id: doc.id,
        title: doc.title,
        text: doc.textContent,
        role: "reference" as const,
      }));
  },

  labels(caller, ids) {
    return new Map(
      getDocumentsByIds(caller.id, caller.role === "admin", ids).map((doc) => [
        doc.id,
        doc.title,
      ]),
    );
  },

  attachToSkill(caller, skillId, ids) {
    const linked = listLinkedDocuments("skill", skillId).map((doc) => doc.id);
    updateSkill(caller, skillId, {
      documentIds: [...new Set([...linked, ...ids])],
    });
  },
};
