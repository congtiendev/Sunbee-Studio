/**
 * URL strings for the app's own pages. `App.tsx` registers the routes with these
 * constants, and links/sidebar/redirects build URLs through the helpers below,
 * so a path is spelled out exactly once.
 *
 * Routes take no dynamic segments (see AGENTS.md): pages that show one record
 * read its id from the query string instead.
 */
export const paths = {
  overview: "/",
  projects: "/projects",
  projectDetail: "/projects/detail",
  studio: "/studio",
  videoRender: "/video-render",
  libraryMedia: "/library/media",
  libraryDocuments: "/library/documents",
  librarySkills: "/library/skills",
  libraryTraining: "/library/training",
  libraryVoices: "/library/voices",
  librarySoundEffects: "/library/sound-effects",
  settings: "/settings",
  databaseAdmin: "/database-admin",
  profile: "/profile",
} as const;

/** Query-string keys the pages above read. */
export const pathParams = {
  projectId: "id",
  videoId: "video",
  skillId: "skill",
  /** The studio's open step (`VideoStudioStepKey`), so a reload stays on it. */
  step: "step",
  /** The video-render page's open render project. */
  renderProjectId: "project",
} as const;

export function projectUrl(projectId: string): string {
  return `${paths.projectDetail}?${pathParams.projectId}=${encodeURIComponent(projectId)}`;
}

/** The studio on one video, optionally opened at a given step (a `VideoStudioStepKey`). */
export function studioUrl(videoId: string, step?: string): string {
  const query = new URLSearchParams({ [pathParams.videoId]: videoId });
  if (step) query.set(pathParams.step, step);
  return `${paths.studio}?${query.toString()}`;
}

/** The video-render page: its project list, or one render project. */
export function videoRenderUrl(projectId?: string): string {
  return projectId
    ? `${paths.videoRender}?${pathParams.renderProjectId}=${encodeURIComponent(projectId)}`
    : paths.videoRender;
}

/** The AI-training page, optionally on an existing skill and/or with a video pre-picked. */
export function trainingUrl(options: { skillId?: string; videoId?: string } = {}): string {
  const query = new URLSearchParams();
  if (options.skillId) query.set(pathParams.skillId, options.skillId);
  if (options.videoId) query.set(pathParams.videoId, options.videoId);
  const qs = query.toString();
  return qs ? `${paths.libraryTraining}?${qs}` : paths.libraryTraining;
}
