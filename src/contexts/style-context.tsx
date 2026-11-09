import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  deleteLocalBlob,
  loadLocalBlob,
  saveLocalBlob,
} from "@/lib/local-blob-store";

export type UiStyle = "classic" | "liquid";
export type ScaleMode = "auto" | "medium" | "off";

type StyleContextType = {
  style: UiStyle;
  setStyle: (style: UiStyle) => void;
  toggleStyle: () => void;
  glassOpacity: number;
  setGlassOpacity: (value: number) => void;
  glassRadius: number;
  setGlassRadius: (value: number) => void;
  scaleMode: ScaleMode;
  setScaleMode: (mode: ScaleMode) => void;
  backgroundLabel: string;
  backgroundInfo: DominantColor | null;
  backgroundError: string | null;
  setBackgroundFromFile: (file: File) => void;
  setBackgroundFromUrl: (url: string) => void;
  resetBackground: () => void;
};

const StyleContext = createContext<StyleContextType | undefined>(undefined);

const STYLE_STORAGE_KEY = "ui-style";
/** Everything else the theme panel sets (the uploaded image itself lives in IndexedDB). */
const PREFS_STORAGE_KEY = "ui-theme-prefs";
const BACKGROUND_BLOB_KEY = "theme-background";

interface ThemePrefs {
  glassOpacity?: number;
  glassRadius?: number;
  scaleMode?: ScaleMode;
  background?:
    | { kind: "url"; url: string; label: string }
    | { kind: "file"; label: string };
}

function readPrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ThemePrefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(patch: Partial<ThemePrefs>): void {
  try {
    const next = { ...readPrefs(), ...patch };
    if (patch.background === undefined && "background" in patch)
      delete next.background;
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Persistence is a convenience; the setting still applies for this session.
  }
}
const DEFAULT_BACKGROUND = "/images/ai/video-thumb.png";
const DEFAULT_LABEL = "Ảnh mặc định";

interface DominantColor {
  h: number;
  s: number;
  neutral: boolean;
}

/**
 * Bins pixels by hue (weighted by saturation × distance-from-gray) and
 * returns the dominant hue/saturation, mirroring a classic "extract accent
 * color from artwork" technique. Drives `--wash-h`, the tint of the
 * liquid-glass backdrop, so the glass atmosphere matches whatever artwork
 * sits behind it.
 */
function extractDominant(img: HTMLImageElement): DominantColor | null {
  const width = 64;
  const height = Math.max(
    1,
    Math.round((width * img.naturalHeight) / img.naturalWidth),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return null; // Canvas tainted (cross-origin without CORS headers).
  }

  const BINS = 36;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, x: 0, y: 0, s: 0 }));
  let weightSum = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] ?? 0;
    if (alpha < 200) continue;
    const r = (pixels[i] ?? 0) / 255;
    const g = (pixels[i + 1] ?? 0) / 255;
    const b = (pixels[i + 2] ?? 0) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    const weight = s * (1 - Math.abs(2 * l - 1));
    if (weight < 0.03) continue;

    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;

    const bin = bins[Math.floor((h / 360) * BINS) % BINS]!;
    const rad = (h * Math.PI) / 180;
    bin.w += weight;
    bin.x += Math.cos(rad) * weight;
    bin.y += Math.sin(rad) * weight;
    bin.s += s * weight;
    weightSum += weight;
  }

  if (weightSum < width * height * 0.01)
    return { h: 199, s: 0.18, neutral: true };

  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < BINS; i++) {
    const score =
      bins[i]!.w +
      0.5 * (bins[(i + 1) % BINS]!.w + bins[(i + BINS - 1) % BINS]!.w);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  const group = [best - 1, best, best + 1].map((i) => bins[(i + BINS) % BINS]!);
  const w = group.reduce((sum, b) => sum + b.w, 0);
  const x = group.reduce((sum, b) => sum + b.x, 0);
  const y = group.reduce((sum, b) => sum + b.y, 0);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;

  return {
    h: deg < 0 ? deg + 360 : deg,
    s: group.reduce((sum, b) => sum + b.s, 0) / w,
    neutral: false,
  };
}

const loadImage = (src: string, cors: boolean) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load"));
    img.src = src;
  });

export function StyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<UiStyle>("classic");
  const [isInitialized, setIsInitialized] = useState(false);
  const [glassOpacity, setGlassOpacityState] = useState(
    () => readPrefs().glassOpacity ?? 62,
  );
  const [glassRadius, setGlassRadiusState] = useState(
    () => readPrefs().glassRadius ?? 28,
  );
  const [scaleMode, setScaleModeState] = useState<ScaleMode>(
    () => readPrefs().scaleMode ?? "off",
  );
  const [backgroundLabel, setBackgroundLabel] = useState(
    () => readPrefs().background?.label ?? DEFAULT_LABEL,
  );
  const [backgroundInfo, setBackgroundInfo] = useState<DominantColor | null>(
    null,
  );
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Load the saved style preference once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STYLE_STORAGE_KEY);
      if (saved === "classic" || saved === "liquid") setStyleState(saved);
    } catch {
      // localStorage unavailable — keep the default.
    }
    setIsInitialized(true);
  }, []);

  // Reflect the style as a class on <html> and persist it.
  useEffect(() => {
    if (!isInitialized) return;
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, style);
    } catch {
      // Ignore — persistence is a convenience, not a requirement.
    }
    document.documentElement.classList.toggle("liquid", style === "liquid");
  }, [style, isInitialized]);

  /** Shows the image and (asynchronously) retints the wash from it. No synchronous state updates. */
  const paintBackground = useCallback(
    (src: string, { analyzeSrc = src, cors = false } = {}) => {
      // Showing the image is never subject to CORS — only *reading its
      // pixels* (for hue extraction, below) is. Apply it unconditionally so
      // a CORS-protected URL still works as a background, it just won't
      // retint the wash.
      document.documentElement.style.setProperty(
        "--lg-bg-image",
        `url("${src}")`,
      );

      loadImage(analyzeSrc, cors)
        .then((img) => {
          const dominant = extractDominant(img);
          if (dominant) {
            document.documentElement.style.setProperty(
              "--wash-h",
              String(dominant.h),
            );
            setBackgroundInfo(dominant);
          }
        })
        .catch(() => {
          // Extraction is best-effort: the background above already applied,
          // so a failure here just means the wash keeps its previous tint.
          if (cors) {
            setBackgroundError(
              "Đã áp dụng ảnh, nhưng không đọc được màu chủ đạo vì ảnh này chặn CORS.",
            );
          }
        });
    },
    [],
  );

  const applyBackground = useCallback(
    (src: string, label: string, options: { cors?: boolean } = {}) => {
      setBackgroundLabel(label);
      setBackgroundError(null);
      paintBackground(src, options);
    },
    [paintBackground],
  );

  // Re-apply the saved glass settings (CSS defaults apply until the user changes them).
  useEffect(() => {
    const prefs = readPrefs();
    const root = document.documentElement;
    if (prefs.glassOpacity !== undefined)
      root.style.setProperty("--lg-a", String(prefs.glassOpacity / 100));
    if (prefs.glassRadius !== undefined)
      root.style.setProperty("--lg-radius", `${prefs.glassRadius}px`);
  }, []);

  // Restore the saved backdrop (an uploaded file from IndexedDB, or a URL), else the default.
  useEffect(() => {
    // The label state was already initialised from the same prefs.
    const saved = readPrefs().background;
    if (saved?.kind === "url") {
      paintBackground(saved.url, { cors: true });
      return;
    }
    if (saved?.kind !== "file") {
      paintBackground(DEFAULT_BACKGROUND);
      return;
    }
    let alive = true;
    void loadLocalBlob(BACKGROUND_BLOB_KEY).then((blob) => {
      if (!alive) return;
      if (!blob) {
        // The stored image is gone (site data cleared): fall back to the default.
        applyBackground(DEFAULT_BACKGROUND, DEFAULT_LABEL);
        writePrefs({ background: undefined });
        return;
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      paintBackground(url);
    });
    return () => {
      alive = false;
    };
  }, [applyBackground, paintBackground]);

  const setBackgroundFromFile = useCallback(
    (file: File) => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      applyBackground(url, file.name);
      void saveLocalBlob(BACKGROUND_BLOB_KEY, file);
      writePrefs({ background: { kind: "file", label: file.name } });
    },
    [applyBackground],
  );

  const setBackgroundFromUrl = useCallback(
    (url: string) => {
      applyBackground(url, "Ảnh từ URL", { cors: true });
      void deleteLocalBlob(BACKGROUND_BLOB_KEY);
      writePrefs({ background: { kind: "url", url, label: "Ảnh từ URL" } });
    },
    [applyBackground],
  );

  const resetBackground = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    applyBackground(DEFAULT_BACKGROUND, DEFAULT_LABEL);
    void deleteLocalBlob(BACKGROUND_BLOB_KEY);
    writePrefs({ background: undefined });
  }, [applyBackground]);

  // Specular highlight tracking + scroll-aware blur reduction (liquid only).
  useEffect(() => {
    if (style !== "liquid") return;
    const root = document.documentElement;

    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      root.setAttribute("data-scrolling", "");
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(
        () => root.removeAttribute("data-scrolling"),
        150,
      );
    };

    const handlePointerMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        ".card-surface, .glass-chrome, .popover-surface",
      );
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty(
        "--mx",
        `${((event.clientX - rect.left) / rect.width) * 100}%`,
      );
      target.style.setProperty(
        "--my",
        `${((event.clientY - rect.top) / rect.height) * 100}%`,
      );
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    return () => {
      clearTimeout(scrollTimer);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("pointermove", handlePointerMove);
      root.removeAttribute("data-scrolling");
    };
  }, [style]);

  // Optional density scaling: zooms the whole app for screens much wider
  // than the design was laid out for. Off by default — Sunbee's layouts are
  // already responsive, so this is a convenience, not a requirement.
  useEffect(() => {
    const BASE_WIDTH = 1440;
    const applyZoom = () => {
      if (scaleMode === "off") {
        document.documentElement.style.zoom = "";
        return;
      }
      const fit = Math.min(1.6, Math.max(1, window.innerWidth / BASE_WIDTH));
      const factor = scaleMode === "auto" ? fit : 1 + (fit - 1) * 0.5;
      document.documentElement.style.zoom =
        factor === 1 ? "" : factor.toFixed(3);
    };
    applyZoom();
    window.addEventListener("resize", applyZoom);
    return () => {
      window.removeEventListener("resize", applyZoom);
      document.documentElement.style.zoom = "";
    };
  }, [scaleMode]);

  const setScaleMode = useCallback((mode: ScaleMode) => {
    setScaleModeState(mode);
    writePrefs({ scaleMode: mode });
  }, []);

  const setStyle = useCallback((next: UiStyle) => setStyleState(next), []);
  const toggleStyle = useCallback(() => {
    setStyleState((prev) => (prev === "liquid" ? "classic" : "liquid"));
  }, []);

  const setGlassOpacity = useCallback((value: number) => {
    setGlassOpacityState(value);
    document.documentElement.style.setProperty("--lg-a", String(value / 100));
    writePrefs({ glassOpacity: value });
  }, []);

  const setGlassRadius = useCallback((value: number) => {
    setGlassRadiusState(value);
    document.documentElement.style.setProperty("--lg-radius", `${value}px`);
    writePrefs({ glassRadius: value });
  }, []);

  return (
    <StyleContext.Provider
      value={{
        style,
        setStyle,
        toggleStyle,
        glassOpacity,
        setGlassOpacity,
        glassRadius,
        setGlassRadius,
        scaleMode,
        setScaleMode,
        backgroundLabel,
        backgroundInfo,
        backgroundError,
        setBackgroundFromFile,
        setBackgroundFromUrl,
        resetBackground,
      }}
    >
      {children}
    </StyleContext.Provider>
  );
}

export const useStyle = () => {
  const context = useContext(StyleContext);
  if (context === undefined) {
    throw new Error("useStyle must be used within a StyleProvider");
  }
  return context;
};
