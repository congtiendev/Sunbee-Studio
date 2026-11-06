import { Router } from "express";
import { PORT } from "../env.js";
import { requireAuth } from "../middleware/require-auth.js";
import { generateMcpToken } from "../services/mcp/token.js";
import { validateApiKey, type ApiKeyProvider } from "../services/validate-api-key.js";
import {
  addAnthropicKey,
  getSettings,
  removeAnthropicKey,
  renameAnthropicKey,
  setActiveAnthropicKey,
  setSettings,
} from "../settings-store.js";
import type { AppSettings } from "../../shared/types.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json(getSettings(req.user!.id));
});

router.post("/", requireAuth, (req, res) => {
  const patch = req.body as Partial<AppSettings>;
  res.json(setSettings(req.user!.id, patch));
});

router.post("/test-key", requireAuth, async (req, res) => {
  const { provider, apiKey } = req.body as { provider?: ApiKeyProvider; apiKey?: string };
  if (provider !== "openai" && provider !== "anthropic") {
    res.status(400).json({ ok: false, error: "Provider không hợp lệ." });
    return;
  }
  const result = await validateApiKey(provider, apiKey ?? "");
  res.json(result);
});

router.post("/anthropic-keys", requireAuth, (req, res) => {
  const { name, apiKey } = req.body as { name?: string; apiKey?: string };
  if (!name?.trim() || !apiKey?.trim()) {
    res.status(400).json({ error: "Vui lòng nhập tên và API key." });
    return;
  }
  res.json(addAnthropicKey(req.user!.id, name.trim(), apiKey.trim()));
});

router.patch("/anthropic-keys/:id", requireAuth, (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "Vui lòng nhập tên." });
    return;
  }
  try {
    res.json(renameAnthropicKey(req.user!.id, req.params.id as string, name.trim()));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/anthropic-keys/:id", requireAuth, (req, res) => {
  res.json(removeAnthropicKey(req.user!.id, req.params.id as string));
});

router.post("/anthropic-keys/:id/activate", requireAuth, (req, res) => {
  try {
    res.json(setActiveAnthropicKey(req.user!.id, req.params.id as string));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/mcp/enable", requireAuth, (req, res) => {
  const token = generateMcpToken();
  const settings = setSettings(req.user!.id, {
    mcpEnabled: true,
    mcpToken: token,
  });
  res.json({ ...settings, url: `http://127.0.0.1:${PORT}/mcp` });
});

export default router;
