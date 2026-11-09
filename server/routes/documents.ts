import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentsByIds,
  listDocuments,
  listLinkedDocuments,
  renameDocument,
  setDocumentTargets,
  setLinkedDocuments,
} from "../services/db/documents-repo.js";
import { getProject } from "../services/db/projects-repo.js";
import { getTemplateById } from "../services/db/style-templates-repo.js";
import { extractDocumentText } from "../services/documents/extract.js";
import { deleteFile, saveFile } from "../services/storage/files.js";
import type { DocumentLink, DocumentLinksRequest, DocumentTargetType, User } from "../../shared/types.js";

/** Reference documents: AI knowledge (attached to skills/projects) and script sources. */
const router = Router();

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_PASTED_CHARS = 500_000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES } });

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const isAdmin = (user: User) => user.role === "admin";

/** Multer decodes multipart filenames as latin1; browsers send UTF-8. */
function decodeFilename(name: string): string {
  const decoded = Buffer.from(name, "latin1").toString("utf-8");
  return decoded.includes("�") ? name : decoded;
}

function canAccessTarget(user: User, targetType: DocumentTargetType, targetId: string): boolean {
  if (targetType === "skill") return getTemplateById(user.id, isAdmin(user), targetId) !== null;
  return getProject(user.id, isAdmin(user), targetId) !== null;
}

router.get("/", requireAuth, (req, res) => {
  res.json(listDocuments(req.user!.id, isAdmin(req.user!)));
});

router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
          error: `File quá lớn. Giới hạn ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB.`,
        });
        return;
      }
      if (err) {
        res.status(400).json({ error: errorMessage(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn file tài liệu." });
      return;
    }
    try {
      const filename = decodeFilename(req.file.originalname);
      const { text, mime } = await extractDocumentText(req.file.buffer, filename);
      const stored = await saveFile(req.user!.id, "document", req.file.buffer, filename, mime);
      const title = (req.body as { title?: string }).title?.trim() || filename;
      const { textContent: _text, ...summary } = createDocument(req.user!.id, {
        title,
        mime,
        textContent: text,
        fileId: stored.id,
      });
      res.json({ ...summary, links: [] });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

/** Create a document from pasted text (no file). */
router.post("/text", requireAuth, (req, res) => {
  const { title, text } = req.body as { title?: string; text?: string };
  if (!title?.trim() || !text?.trim()) {
    res.status(400).json({ error: "Vui lòng nhập tiêu đề và nội dung." });
    return;
  }
  if (text.length > MAX_PASTED_CHARS) {
    res.status(400).json({ error: `Nội dung quá dài (tối đa ${MAX_PASTED_CHARS} ký tự).` });
    return;
  }
  const { textContent: _text, ...summary } = createDocument(req.user!.id, {
    title: title.trim(),
    mime: "text/plain",
    textContent: text.trim(),
  });
  res.json({ ...summary, links: [] });
});

/** Documents attached to a skill or project. */
router.get("/links", requireAuth, (req, res) => {
  const targetType = req.query.targetType as DocumentTargetType;
  const targetId = req.query.targetId as string;
  if ((targetType !== "skill" && targetType !== "project") || !targetId) {
    res.status(400).json({ error: "Thiếu targetType/targetId." });
    return;
  }
  if (!canAccessTarget(req.user!, targetType, targetId)) {
    res.status(404).json({ error: "Không tìm thấy." });
    return;
  }
  res.json(
    listLinkedDocuments(targetType, targetId).map(({ textContent: _text, ...summary }) => summary),
  );
});

router.put("/links", requireAuth, (req, res) => {
  const body = req.body as DocumentLinksRequest;
  if ((body.targetType !== "skill" && body.targetType !== "project") || !body.targetId) {
    res.status(400).json({ error: "Thiếu targetType/targetId." });
    return;
  }
  if (!canAccessTarget(req.user!, body.targetType, body.targetId)) {
    res.status(404).json({ error: "Không tìm thấy." });
    return;
  }
  const allowed = getDocumentsByIds(req.user!.id, isAdmin(req.user!), body.documentIds ?? []);
  setLinkedDocuments(body.targetType, body.targetId, allowed.map((doc) => doc.id));
  res.json(allowed.map(({ textContent: _text, ...summary }) => summary));
});

router.get("/:id", requireAuth, (req, res) => {
  const doc = getDocument(req.user!.id, isAdmin(req.user!), req.params.id as string);
  if (!doc) {
    res.status(404).json({ error: "Không tìm thấy tài liệu." });
    return;
  }
  res.json(doc);
});

/** Replace every skill/project this document is attached to. */
router.put("/:id/links", requireAuth, (req, res) => {
  const id = req.params.id as string;
  if (!getDocument(req.user!.id, isAdmin(req.user!), id)) {
    res.status(404).json({ error: "Không tìm thấy tài liệu." });
    return;
  }
  const links = ((req.body as { links?: DocumentLink[] }).links ?? []).filter(
    (link) =>
      (link.targetType === "skill" || link.targetType === "project") &&
      typeof link.targetId === "string" &&
      canAccessTarget(req.user!, link.targetType, link.targetId),
  );
  setDocumentTargets(id, links);
  res.json(links);
});

router.patch("/:id", requireAuth, (req, res) => {
  const title = (req.body as { title?: string }).title?.trim();
  if (!title) {
    res.status(400).json({ error: "Vui lòng nhập tiêu đề." });
    return;
  }
  if (!renameDocument(req.user!.id, isAdmin(req.user!), req.params.id as string, title)) {
    res.status(404).json({ error: "Không tìm thấy tài liệu." });
    return;
  }
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, async (req, res) => {
  const fileId = deleteDocument(req.user!.id, isAdmin(req.user!), req.params.id as string);
  if (fileId) await deleteFile(req.user!.id, isAdmin(req.user!), fileId);
  res.json({ ok: true });
});

export default router;
