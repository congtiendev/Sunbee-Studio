import type { NextFunction, Request, Response } from "express";
import { canAccessVideo } from "../services/db/videos-repo.js";

/**
 * Rejects a request that names a video (`videoId` in the body or query) the
 * signed-in user may not work on — so an id from someone else's account can't
 * pull their project's documents into an AI prompt or attach work to their video.
 * `videoId` stays optional: requests without one pass through.
 *
 * Mount after `requireAuth` and after any body parser the route uses (e.g. multer).
 */
export function requireVideoAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const fromBody = (req.body as { videoId?: unknown } | undefined)?.videoId;
  const videoId = fromBody ?? req.query.videoId;
  if (videoId === undefined || videoId === null || videoId === "") {
    next();
    return;
  }
  if (
    typeof videoId !== "string" ||
    !canAccessVideo(req.user!.id, req.user!.role === "admin", videoId)
  ) {
    res.status(404).json({ error: "Không tìm thấy video." });
    return;
  }
  next();
}
