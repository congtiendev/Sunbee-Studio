import { readFileSync } from "node:fs";
import type { TrainingCandidate } from "../../../../shared/types.js";
import { getFileForUser } from "../../../services/storage/files.js";
import {
  getTrainingImagesByIds,
  listTrainingImages,
  type TrainingImageRecord,
} from "../../../services/db/training-images-repo.js";
import type { TrainingSource } from "./types.js";

const isAdmin = (caller: { role: string }) => caller.role === "admin";

function dataUrlOf(userId: string, admin: boolean, record: TrainingImageRecord): string | null {
  const file = getFileForUser(userId, admin, record.fileId);
  if (!file) return null;
  const buffer = readFileSync(file.absolutePath);
  return `data:${file.mime};base64,${buffer.toString("base64")}`;
}

/**
 * Example images for an "image" skill: the AI reads them (vision) and writes
 * the graphics-style methodology. Unlike text sources, re-training does not
 * resend previously-learned images — the skill's current `graphicsStyle` text
 * already distills them, so only newly-picked images are read here each run.
 */
export const imageSource: TrainingSource = {
  kind: "image",
  noun: "ảnh",
  max: 12,

  listCandidates(caller) {
    return listTrainingImages(caller.id, isAdmin(caller)).map(
      (image): TrainingCandidate => ({
        kind: "image",
        id: image.id,
        title: image.title || "Ảnh",
        group: "",
        excerpt: "",
        charCount: 0,
        badges: [],
        previewUrl: `/api/files/${image.fileId}`,
      }),
    );
  },

  load(caller, ids) {
    const records = getTrainingImagesByIds(caller.id, isAdmin(caller), [...new Set(ids)]);
    return records.flatMap((record) => {
      const dataUrl = dataUrlOf(caller.id, isAdmin(caller), record);
      if (!dataUrl) return [];
      return [
        {
          kind: "image" as const,
          id: record.id,
          title: record.title || "Ảnh",
          text: "",
          role: "visual" as const,
          images: [dataUrl],
        },
      ];
    });
  },

  labels(caller, ids) {
    return new Map(
      getTrainingImagesByIds(caller.id, isAdmin(caller), ids).map((image) => [
        image.id,
        image.title || "Ảnh",
      ]),
    );
  },
};
