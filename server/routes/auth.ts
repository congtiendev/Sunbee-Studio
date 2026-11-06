import { Router } from "express";
import type { AuthLoginRequest, AuthRegisterRequest } from "../../shared/types.js";
import { optionalAuth, requireAuth } from "../middleware/require-auth.js";
import { createSessionToken, deleteSessionToken } from "../services/auth/session.js";
import { createUser, listAllUsers, verifyCredentials } from "../services/db/users-repo.js";
import { listLogDates, readLogEntries } from "../services/log-reader.js";

const router = Router();

const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

router.post("/register", (req, res) => {
  try {
    const body = req.body as AuthRegisterRequest;
    const user = createUser(body.email, body.name, body.password);
    const token = createSessionToken(user.id);
    res.cookie("sunbee_sid", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: REMEMBER_MAX_AGE,
    });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/login", (req, res) => {
  const body = req.body as AuthLoginRequest;
  const user = verifyCredentials(body.email, body.password);
  if (!user) {
    res.status(401).json({ error: "Email hoặc mật khẩu không đúng." });
    return;
  }
  const token = createSessionToken(user.id);
  res.cookie("sunbee_sid", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    ...(body.remember ? { maxAge: REMEMBER_MAX_AGE } : {}),
  });
  res.json(user);
});

router.post("/logout", (req, res) => {
  const token = req.cookies?.sunbee_sid as string | undefined;
  if (token) deleteSessionToken(token);
  res.clearCookie("sunbee_sid");
  res.json({ ok: true });
});

router.get("/session", optionalAuth, (req, res) => {
  res.json(req.user ?? null);
});

export const adminRouter = Router();

adminRouter.get("/users", requireAuth, (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Chỉ admin mới xem được danh sách tài khoản." });
    return;
  }
  res.json(listAllUsers());
});

adminRouter.get("/logs", requireAuth, (req, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Chỉ admin mới xem được log." });
    return;
  }
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const level = typeof req.query.level === "string" ? req.query.level : undefined;
  const limit = Math.min(Number(req.query.limit) || 300, 1000);
  res.json({
    dates: listLogDates(),
    entries: readLogEntries(date, level, limit),
  });
});

export default router;
