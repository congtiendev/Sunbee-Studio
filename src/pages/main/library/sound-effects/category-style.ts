import type { IconProps } from "@/icons";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  BellIcon,
  BoltIcon,
  CameraIcon,
  ChatIcon,
  ChipIcon,
  DollarIcon,
  HourglassIcon,
  MusicIcon,
  PageIcon,
  ShootingStarIcon,
  SoundIcon,
  SunIcon,
  TextIcon,
} from "@/icons";
import type { Translator } from "@/i18n";
import type { ComponentType } from "react";

interface CategoryStyle {
  /** Gradient stops for the cover tile (used with `bg-linear-to-br`). */
  gradient: string;
  Icon: ComponentType<IconProps>;
}

// Cover art per system-library category, like album art in a story music picker.
const STYLES: Record<string, CategoryStyle> = {
  whoosh: { gradient: "from-sky-400 to-indigo-500", Icon: ArrowRightIcon },
  riser: { gradient: "from-violet-400 to-fuchsia-500", Icon: ArrowUpIcon },
  impact: { gradient: "from-orange-400 to-red-500", Icon: BoltIcon },
  ui: { gradient: "from-emerald-400 to-teal-500", Icon: BellIcon },
  typing: { gradient: "from-slate-400 to-slate-600", Icon: TextIcon },
  camera: { gradient: "from-zinc-500 to-neutral-700", Icon: CameraIcon },
  money: { gradient: "from-lime-400 to-green-600", Icon: DollarIcon },
  paper: { gradient: "from-amber-300 to-orange-400", Icon: PageIcon },
  comedy: { gradient: "from-pink-400 to-rose-500", Icon: ChatIcon },
  magic: { gradient: "from-purple-400 to-pink-400", Icon: ShootingStarIcon },
  tension: { gradient: "from-gray-700 to-red-900", Icon: HourglassIcon },
  glitch: { gradient: "from-cyan-400 to-blue-600", Icon: ChipIcon },
  nature: { gradient: "from-green-400 to-emerald-600", Icon: SunIcon },
  music: { gradient: "from-brand-400 to-brand-600", Icon: MusicIcon },
};

const FALLBACK: CategoryStyle = { gradient: "from-gray-400 to-gray-600", Icon: SoundIcon };

export function categoryStyle(categoryId: string | undefined): CategoryStyle {
  return (categoryId && STYLES[categoryId]) || FALLBACK;
}

/** Localized category name (`soundEffects.categories.<id>`), falling back to the catalog's own title. */
export function categoryLabel(t: Translator, categoryId: string, fallback: string): string {
  const key = `categories.${categoryId}`;
  const label = t(key);
  return label === key ? fallback : label;
}

/** The system category id a saved library asset came from (`sourcePackId` = `system:<category>:<slug>`). */
export function systemCategoryOf(sourcePackId: string | undefined): string | undefined {
  return sourcePackId?.startsWith("system:") ? sourcePackId.split(":")[1] : undefined;
}

/** Diacritic- and case-insensitive text for search ("Hài hước" ≈ "hai huoc"). */
export function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
