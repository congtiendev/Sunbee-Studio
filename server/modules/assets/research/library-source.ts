import type { AssetCandidate, LibraryAsset, LibraryMediaType } from "../../../../shared/types.js";
import type { ResearchSource } from "../../../services/research/types.js";
import { searchLibrary } from "../repo.js";

export function libraryCandidate(asset: LibraryAsset): AssetCandidate {
  const fileUrl = `/api/files/${asset.fileId}`;
  return {
    sourceKey: "library",
    externalId: asset.id,
    mediaType: asset.mediaType,
    title: asset.name,
    previewUrl: asset.mediaType === "image" ? fileUrl : undefined,
    url: fileUrl,
    description: [asset.description, asset.tags.length ? `#${asset.tags.join(" #")}` : ""]
      .filter(Boolean)
      .join(" "),
  };
}

/** The user's own uploaded assets. No key needed. */
export const librarySource: ResearchSource = {
  key: "library",
  label: "Library",
  kind: "library",
  mediaTypes: ["image", "video", "audio"],
  requiresKey: false,

  async search({ query, mediaType }, { userId, isAdmin }) {
    const assets = searchLibrary(userId, isAdmin, {
      query,
      mediaType: mediaType && mediaType !== "link" ? (mediaType as LibraryMediaType) : undefined,
    });
    return { candidates: assets.map(libraryCandidate) };
  },
};
