import type { AssetCandidate } from "../../../../shared/types.js";
import { DEFAULT_PER_PAGE, fetchJson, type StockSource } from "../types.js";

interface PexelsPhoto {
  id: number;
  url: string;
  alt: string;
  width: number;
  height: number;
  photographer: string;
  src: { medium: string; large2x: string };
}

interface PexelsVideo {
  id: number;
  url: string;
  width: number;
  height: number;
  duration: number;
  image: string;
  user: { name: string };
  video_files: { link: string; quality: string | null; width: number | null }[];
}

function headers(apiKey: string) {
  return { Authorization: apiKey };
}

/** Prefer an HD (not 4K) rendition: good enough to edit with, fast to download. */
function pickVideoFile(files: PexelsVideo["video_files"]): string | undefined {
  const sorted = [...files].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return (sorted.find((f) => (f.width ?? 0) <= 1920) ?? sorted[0])?.link;
}

export const pexelsSource: StockSource = {
  key: "pexels",
  label: "Pexels",
  kind: "stock",
  mediaTypes: ["image", "video"],
  requiresKey: true,
  keyUrl: "https://www.pexels.com/api/",

  async validateKey(apiKey) {
    try {
      await fetchJson("https://api.pexels.com/v1/search?query=nature&per_page=1", {
        headers: headers(apiKey),
      });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },

  async search({ query, mediaType = "image", perPage = DEFAULT_PER_PAGE }, { apiKey }) {
    if (!apiKey) throw new Error("Chưa thiết lập Pexels API key.");
    const q = encodeURIComponent(query);

    if (mediaType === "video") {
      const data = await fetchJson<{ videos: PexelsVideo[] }>(
        `https://api.pexels.com/videos/search?query=${q}&per_page=${perPage}`,
        { headers: headers(apiKey) },
      );
      return data.videos.flatMap((video): AssetCandidate[] => {
        const url = pickVideoFile(video.video_files);
        if (!url) return [];
        return [
          {
            sourceKey: "pexels",
            externalId: String(video.id),
            mediaType: "video",
            title: `Pexels video ${video.id}`,
            previewUrl: video.image,
            url,
            pageUrl: video.url,
            attribution: `Video by ${video.user.name} on Pexels`,
            width: video.width,
            height: video.height,
            durationSec: video.duration,
          },
        ];
      });
    }

    if (mediaType !== "image") return [];
    const data = await fetchJson<{ photos: PexelsPhoto[] }>(
      `https://api.pexels.com/v1/search?query=${q}&per_page=${perPage}`,
      { headers: headers(apiKey) },
    );
    return data.photos.map((photo) => ({
      sourceKey: "pexels",
      externalId: String(photo.id),
      mediaType: "image",
      title: photo.alt || `Pexels photo ${photo.id}`,
      previewUrl: photo.src.medium,
      url: photo.src.large2x,
      pageUrl: photo.url,
      attribution: `Photo by ${photo.photographer} on Pexels`,
      width: photo.width,
      height: photo.height,
    }));
  },
};
