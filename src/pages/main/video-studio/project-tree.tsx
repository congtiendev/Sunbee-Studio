import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FolderIcon, PlayIcon, PlusIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type { Category, Video } from "@shared/types";
import { useEffect, useState } from "react";

interface ProjectTreeProps {
  projectId: string;
  selectedVideoId: string | null;
  onSelectVideo: (id: string) => void;
  className?: string;
}

const pillBase =
  "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors";
const pillActive =
  "border-brand-500 bg-brand-50 text-brand-600 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400";
const pillInactive =
  "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700";
const pillGhost =
  "border-dashed border-gray-300 text-gray-500 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600";

export default function ProjectTree({
  projectId,
  selectedVideoId,
  onSelectVideo,
  className,
}: ProjectTreeProps) {
  const t = useTranslations("videoStudio");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [videosByCategory, setVideosByCategory] = useState<Record<string, Video[]>>({});
  const [loadingVideosFor, setLoadingVideosFor] = useState<string | null>(null);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingVideo, setAddingVideo] = useState(false);
  const [newVideoName, setNewVideoName] = useState("");

  const loadVideosFor = (categoryId: string) => {
    setLoadingVideosFor(categoryId);
    apiClient.videos
      .list(categoryId)
      .then((data) => {
        setVideosByCategory((prev) => ({ ...prev, [categoryId]: data }));
      })
      .catch(() => {
        // Non-critical: this category's video list just stays empty.
      })
      .finally(() => {
        setLoadingVideosFor((cur) => (cur === categoryId ? null : cur));
      });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCategories([]);
    setVideosByCategory({});
    setActiveCategoryId(null);
    apiClient.categories
      .list(projectId)
      .then(async (data) => {
        if (!active) return;
        setCategories(data);
        // Restore: if a video is already selected (e.g. the URL carried it
        // across a page refresh), find which category holds it and make
        // that one active instead of defaulting to none selected.
        if (selectedVideoId) {
          const results = await Promise.all(
            data.map(async (c) => [c.id, await apiClient.videos.list(c.id)] as const),
          );
          if (!active) return;
          const videosMap: Record<string, Video[]> = {};
          let matchCategoryId: string | null = null;
          for (const [categoryId, videos] of results) {
            videosMap[categoryId] = videos;
            if (videos.some((v) => v.id === selectedVideoId)) matchCategoryId = categoryId;
          }
          setVideosByCategory(videosMap);
          setActiveCategoryId(matchCategoryId ?? data[0]?.id ?? null);
        } else if (data.length > 0) {
          setActiveCategoryId(data[0].id);
          loadVideosFor(data[0].id);
        }
      })
      .catch(() => {
        // Non-critical: the picker just stays empty for this project.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Deliberately only re-runs on projectId change — see restore comment
    // above for why selectedVideoId is read without being a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSelectCategory = (categoryId: string) => {
    setActiveCategoryId(categoryId);
    if (!videosByCategory[categoryId]) loadVideosFor(categoryId);
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const category = await apiClient.categories.create(projectId, name);
    setCategories((prev) => [...prev, category]);
    setVideosByCategory((prev) => ({ ...prev, [category.id]: [] }));
    setActiveCategoryId(category.id);
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const handleAddVideo = async () => {
    const name = newVideoName.trim();
    if (!name || !activeCategoryId) return;
    const video = await apiClient.videos.create(activeCategoryId, name);
    setVideosByCategory((prev) => ({
      ...prev,
      [activeCategoryId]: [video, ...(prev[activeCategoryId] ?? [])],
    }));
    setNewVideoName("");
    setAddingVideo(false);
    onSelectVideo(video.id);
  };

  const activeVideos = activeCategoryId ? (videosByCategory[activeCategoryId] ?? []) : [];

  return (
    <div className={cn("space-y-3", className)}>
      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => handleSelectCategory(category.id)}
                className={cn(
                  pillBase,
                  category.id === activeCategoryId ? pillActive : pillInactive,
                )}
              >
                <FolderIcon className="size-4 shrink-0" />
                {category.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setAddingCategory(true);
                setNewCategoryName("");
              }}
              className={cn(pillBase, pillGhost)}
            >
              <PlusIcon className="size-4 shrink-0" />
              {t("category.addButton")}
            </button>
          </div>

          {activeCategoryId && (
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
              {loadingVideosFor === activeCategoryId ? (
                <Spinner />
              ) : (
                activeVideos.map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => onSelectVideo(video.id)}
                    className={cn(
                      pillBase,
                      video.id === selectedVideoId ? pillActive : pillInactive,
                    )}
                  >
                    <PlayIcon className="size-4 shrink-0" />
                    {video.name}
                  </button>
                ))
              )}
              <button
                type="button"
                onClick={() => {
                  setAddingVideo(true);
                  setNewVideoName("");
                }}
                className={cn(pillBase, pillGhost)}
              >
                <PlusIcon className="size-4 shrink-0" />
                {t("video.addButton")}
              </button>
            </div>
          )}
        </>
      )}

      <Dialog open={addingCategory} onOpenChange={setAddingCategory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("category.addButton")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder={t("category.namePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddCategory();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddingCategory(false)}>
              {t("manage.cancelButton")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddCategory()}
              disabled={!newCategoryName.trim()}
            >
              {t("category.addButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addingVideo} onOpenChange={setAddingVideo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("video.addButton")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newVideoName}
            onChange={(e) => setNewVideoName(e.target.value)}
            placeholder={t("video.namePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddVideo();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddingVideo(false)}>
              {t("manage.cancelButton")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddVideo()}
              disabled={!newVideoName.trim()}
            >
              {t("video.addButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
