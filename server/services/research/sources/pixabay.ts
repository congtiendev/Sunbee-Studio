import type { AssetCandidate } from "../../../../shared/types.js";
import { DEFAULT_PER_PAGE, fetchJson, type StockSource } from "../types.js";

interface PixabayImage {
  id: number;
  pageURL: string;
  tags: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
}

interface PixabayVideoRendition {
  url: string;
  width: number;
  height: number;
  thumbnail?: string;
}

interface PixabayVideo {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  user: string;
  videos: Partial<Record<"large" | "medium" | "small" | "tiny", PixabayVideoRendition>>;
}

export const pixabaySource: StockSource = {
  key: "pixabay",
  label: "Pixabay",
  kind: "stock",
  mediaTypes: ["image", "video"],
  requiresKey: true,
  keyUrl: "https://pixabay.com/api/docs/",

  async validateKey(apiKey) {
    try {
      await fetchJson(
        `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=nature&per_page=3`,
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },

  async search({ query, mediaType = "image", perPage = DEFAULT_PER_PAGE }, { apiKey }) {
    if (!apiKey) throw new Error("Chưa thiết lập Pixabay API key.");
    // Pixabay requires per_page in 3..200.
    const params = `key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${Math.max(3, perPage)}&safesearch=true`;

    if (mediaType === "video") {
      const data = await fetchJson<{ hits: PixabayVideo[] }>(
        `https://pixabay.com/api/videos/?${params}`,
      );
      return data.hits.flatMap((video): AssetCandidate[] => {
        const rendition = video.videos.medium ?? video.videos.large ?? video.videos.small;
        if (!rendition) return [];
        return [
          {
            sourceKey: "pixabay",
            externalId: String(video.id),
            mediaType: "video",
            title: video.tags || `Pixabay video ${video.id}`,
            previewUrl: rendition.thumbnail,
            url: rendition.url,
            pageUrl: video.pageURL,
            attribution: `Video by ${video.user} on Pixabay`,
            width: rendition.width,
            height: rendition.height,
            durationSec: video.duration,
          },
        ];
      });
    }

    if (mediaType !== "image") return [];
    const data = await fetchJson<{ hits: PixabayImage[] }>(
      `https://pixabay.com/api/?${params}&image_type=photo`,
    );
    return data.hits.map((image) => ({
      sourceKey: "pixabay",
      externalId: String(image.id),
      mediaType: "image",
      title: image.tags || `Pixabay image ${image.id}`,
      previewUrl: image.webformatURL,
      url: image.largeImageURL,
      pageUrl: image.pageURL,
      attribution: `Image by ${image.user} on Pixabay`,
      width: image.imageWidth,
      height: image.imageHeight,
    }));
  },
};
