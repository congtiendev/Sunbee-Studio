import { paths, projectUrl, studioUrl } from "@/lib/paths";
import { Navigate, useSearchParams } from "react-router";

/**
 * The old `/video-studio?project=…&video=…` page was split into Projects and
 * the Studio. Keeps old links and bookmarks (and the Electron window's last
 * URL) landing in the right place.
 */
export default function LegacyVideoStudioRedirect() {
  const [searchParams] = useSearchParams();
  const videoId = searchParams.get("video");
  const projectId = searchParams.get("project");

  const target = videoId
    ? studioUrl(videoId)
    : projectId
      ? projectUrl(projectId)
      : paths.projects;
  return <Navigate to={target} replace />;
}
