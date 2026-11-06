import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import { logger } from "../services/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logger.info("request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id,
      ip: req.ip,
    });
  });

  next();
}

export const errorLogger: ErrorRequestHandler = (err, req, res, next) => {
  logger.error("unhandled error", {
    method: req.method,
    path: req.path,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Đã có lỗi xảy ra ở máy chủ." });
};
