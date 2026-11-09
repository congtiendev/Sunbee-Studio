import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/require-auth.js";
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
} from "../services/db/style-templates-repo.js";
import { exportSkill, importSkillFile } from "../services/skills/package.js";
import { getSkillDetail, updateSkill, withSkillDefaults } from "../services/skills/skills.js";
import type { SkillInput, SkillUpdateRequest } from "../../shared/types.js";

/** Skills (stored as "style templates"; the API path is kept for compatibility). */
const router = Router();

const MAX_SKILL_FILE_BYTES = 20 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SKILL_FILE_BYTES } });

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get("/", requireAuth, (req, res) => {
  res.json(listTemplates(req.user!.id, req.user!.role === "admin"));
});

router.post("/", requireAuth, (req, res) => {
  const input = req.body as SkillInput;
  if (!input?.name?.trim()) {
    res.status(400).json({ error: "Vui lòng nhập tên skill." });
    return;
  }
  res.json(saveTemplate(req.user!.id, withSkillDefaults(input)));
});

/** Import a `.sunbee-skill.json`, an Agent Skill `SKILL.md`, or an Agent Skill `.zip`. */
router.post(
  "/import",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: errorMessage(err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Chưa chọn file skill." });
      return;
    }
    try {
      res.json(await importSkillFile(req.user!, req.file.originalname, req.file.buffer));
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  },
);

router.get("/:id", requireAuth, (req, res) => {
  const detail = getSkillDetail(req.user!, req.params.id as string);
  if (!detail) {
    res.status(404).json({ error: "Không tìm thấy skill." });
    return;
  }
  res.json(detail);
});

router.put("/:id", requireAuth, (req, res) => {
  const body = req.body as SkillUpdateRequest;
  if (body.name !== undefined && !body.name.trim()) {
    res.status(400).json({ error: "Vui lòng nhập tên skill." });
    return;
  }
  const detail = updateSkill(req.user!, req.params.id as string, body);
  if (!detail) {
    res.status(404).json({ error: "Không tìm thấy skill." });
    return;
  }
  res.json(detail);
});

router.get("/:id/export", requireAuth, (req, res) => {
  const pkg = exportSkill(req.user!, req.params.id as string);
  if (!pkg) {
    res.status(404).json({ error: "Không tìm thấy skill." });
    return;
  }
  const filename = `${pkg.skill.name.replace(/[^\p{L}\p{N}_-]+/gu, "-")}.sunbee-skill.json`;
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.json(pkg);
});

router.delete("/:id", requireAuth, (req, res) => {
  deleteTemplate(req.user!.id, req.user!.role === "admin", req.params.id as string);
  res.json({ ok: true });
});

export default router;
