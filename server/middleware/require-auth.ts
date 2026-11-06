import type { NextFunction, Request, Response } from "express";
import { resolveSessionToken } from "../services/auth/session.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: import("../../shared/types.js").User | null;
    }
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = resolveSessionToken(req.cookies?.sunbee_sid ?? "");
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = resolveSessionToken(req.cookies?.sunbee_sid ?? "");
  if (!user) {
    res.status(401).json({ error: "Bạn cần đăng nhập để dùng tính năng này." });
    return;
  }
  req.user = user;
  next();
}
