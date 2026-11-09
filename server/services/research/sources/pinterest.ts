import type { AssetCandidate } from "../../../../shared/types.js";
import { DEFAULT_PER_PAGE, fetchJson, type StockSource } from "../types.js";

/**
 * Pinterest (official API v5, OAuth access token with `pins:read` +
 * `boards:read`). Public keyword search (`/search/partner/pins`) is a beta
 * Pinterest grants per app; without it we fall back to `/search/pins`,
 * which searches the token owner's own Pins and boards (a moodboard).
 * Pins are other people's work: results are references, not licensed media.
 */

const API = "https://api.pinterest.com/v5";

type ImageMap = Record<
  string,
  { url?: string; width?: number; height?: number } | undefined
>;

interface PinterestPin {
  id: string;
  title?: string | null;
  description?: string | null;
  alt_text?: string | null;
  link?: string | null;
  board_owner?: { username?: string } | null;
  media?: { media_type?: string; images?: ImageMap } | null;
  /** Partner search returns images at the top level. */
  images?: ImageMap;
  image_large_url?: string;
  image_medium_url?: string;
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Largest rendition for the media URL, a mid-size one for the grid preview. */
function pickImages(pin: PinterestPin): {
  url?: string;
  preview?: string;
  width?: number;
  height?: number;
} {
  const map = pin.media?.images ?? pin.images ?? {};
  const renditions = Object.values(map)
    .filter(
      (image): image is { url: string; width?: number; height?: number } =>
        Boolean(image?.url),
    )
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const largest = renditions[0];
  const preview =
    map["600x"]?.url ??
    map["400x300"]?.url ??
    renditions.find((r) => (r.width ?? 0) <= 600)?.url;
  return {
    url: largest?.url ?? pin.image_large_url,
    preview: preview ?? pin.image_medium_url ?? largest?.url,
    width: largest?.width,
    height: largest?.height,
  };
}

function toCandidate(pin: PinterestPin): AssetCandidate | null {
  const { url, preview, width, height } = pickImages(pin);
  if (!url) return null;
  const owner = pin.board_owner?.username;
  return {
    sourceKey: "pinterest",
    externalId: pin.id,
    mediaType: "image",
    title: pin.title?.trim() || pin.alt_text?.trim() || `Pin ${pin.id}`,
    previewUrl: preview,
    url,
    pageUrl: `https://www.pinterest.com/pin/${pin.id}/`,
    attribution: `${owner ? `Pin by ${owner}` : "Pin"} on Pinterest — reference only`,
    description: pin.description?.trim() || undefined,
    width,
    height,
  };
}

export const pinterestSource: StockSource = {
  key: "pinterest",
  label: "Pinterest",
  kind: "stock",
  mediaTypes: ["image"],
  requiresKey: true,
  keyUrl: "https://developers.pinterest.com/apps/",

  async validateKey(token) {
    try {
      await fetchJson(`${API}/user_account`, { headers: headers(token) });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },

  async search({ query, perPage = DEFAULT_PER_PAGE }, { apiKey }) {
    if (!apiKey) throw new Error("Chưa thiết lập Pinterest access token.");
    const q = encodeURIComponent(query);
    try {
      // Public search (beta; only for apps Pinterest approved).
      const data = await fetchJson<{ items?: PinterestPin[] }>(
        `${API}/search/partner/pins?term=${q}&country_code=US&limit=${Math.min(perPage, 50)}`,
        { headers: headers(apiKey) },
      );
      const candidates = (data.items ?? []).flatMap(
        (pin) => toCandidate(pin) ?? [],
      );
      if (candidates.length > 0) return candidates;
    } catch {
      // No beta access (403) or not available: search the user's own Pins instead.
    }
    const own = await fetchJson<{ items?: PinterestPin[] }>(
      `${API}/search/pins?query=${q}&page_size=${Math.min(perPage, 50)}`,
      { headers: headers(apiKey) },
    );
    return (own.items ?? []).flatMap((pin) => toCandidate(pin) ?? []);
  },
};
