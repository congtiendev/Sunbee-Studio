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
  libraryMedia: "/library/media",
  libraryDocuments: "/library/documents",
  librarySkills: "/library/skills",
  libraryTraining: "/library/training",
  settings: "/settings",
  databaseAdmin: "/database-admin",
  profile: "/profile",
} as const;

/** Query-string keys the pages above read. */
export const pathParams = {
  projectId: "id",
  videoId: "video",
  skillId: "skill",
} as const;

export function projectUrl(projectId: string): string {
  return `${paths.projectDetail}?${pathParams.projectId}=${encodeURIComponent(projectId)}`;
}

export function studioUrl(videoId: string): string {
  return `${paths.studio}?${pathParams.videoId}=${encodeURIComponent(videoId)}`;
}

/** The AI-training page, optionally on an existing skill and/or with a video pre-picked. */
export function trainingUrl(options: { skillId?: string; videoId?: string } = {}): string {
  const query = new URLSearchParams();
  if (options.skillId) query.set(pathParams.skillId, options.skillId);
  if (options.videoId) query.set(pathParams.videoId, options.videoId);
  const qs = query.toString();
  return qs ? `${paths.libraryTraining}?${qs}` : paths.libraryTraining;
}
