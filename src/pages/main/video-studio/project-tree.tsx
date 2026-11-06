import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDownIcon, FolderIcon, PlayIcon, PlusIcon } from "@/icons";
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

export default function ProjectTree({
  projectId,
  selectedVideoId,
  onSelectVideo,
  className,
}: ProjectTreeProps) {
  const t = useTranslations("videoStudio");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<string>>(new Set());
  const [videosByCategory, setVideosByCategory] = useState<Record<string, Video[]>>({});
  const [loadingVideosFor, setLoadingVideosFor] = useState<string | null>(null);

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingVideoFor, setAddingVideoFor] = useState<string | null>(null);
  const [newVideoName, setNewVideoName] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCategories([]);
    setVideosByCategory({});
    setOpenCategoryIds(new Set());
    apiClient.categories
      .list(projectId)
      .then(async (data) => {
        if (!active) return;
        setCategories(data);
        // Restore: if a video is already selected (e.g. the URL carried it
        // across a page refresh), find which category holds it and expand
        // that one instead of leaving the whole tree collapsed.
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
          if (matchCategoryId) setOpenCategoryIds(new Set([matchCategoryId]));
        }
      })
      .catch(() => {
        // Non-critical: the tree just stays empty for this project.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Deliberately only re-runs on projectId change: selectedVideoId is read
    // here purely to restore which category to expand on first load (e.g.
    // after a refresh), not to re-expand every time the user picks a video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggleCategory = (categoryId: string) => {
    const next = new Set(openCategoryIds);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
      if (!videosByCategory[categoryId]) {
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
      }
    }
    setOpenCategoryIds(next);
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const category = await apiClient.categories.create(projectId, name);
    setCategories((prev) => [...prev, category]);
    setNewCategoryName("");
    setAddingCategory(false);
  };

  const handleAddVideo = async (categoryId: string) => {
    const name = newVideoName.trim();
    if (!name) return;
    const video = await apiClient.videos.create(categoryId, name);
    setVideosByCategory((prev) => ({
      ...prev,
      [categoryId]: [video, ...(prev[categoryId] ?? [])],
    }));
    setNewVideoName("");
    setAddingVideoFor(null);
    onSelectVideo(video.id);
  };

  return (
    <div className={cn("space-y-1", className)}>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        categories.map((category) => {
          const isOpen = openCategoryIds.has(category.id);
          const videos = videosByCategory[category.id] ?? [];
          return (
            <Collapsible
              key={category.id}
              open={isOpen}
              onOpenChange={() => toggleCategory(category.id)}
            >
              <CollapsibleTrigger
                className={cn(
                  "group menu-item w-full cursor-pointer",
                  isOpen ? "menu-item-active" : "menu-item-inactive",
                )}
              >
                <FolderIcon
                  className={cn(
                    "size-4 shrink-0",
                    isOpen ? "menu-item-icon-active" : "menu-item-icon-inactive",
                  )}
                />
                <span className="truncate">{category.name}</span>
                <ChevronDownIcon
                  className={cn(
                    "ms-auto size-4 shrink-0 transition-transform duration-200",
                    isOpen ? "rotate-180 text-brand-500" : "text-gray-400",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 ms-6 space-y-1">
                  {loadingVideosFor === category.id ? (
                    <div className="flex justify-center py-2">
                      <Spinner />
                    </div>
                  ) : (
                    videos.map((video) => (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => onSelectVideo(video.id)}
                        className={cn(
                          "menu-dropdown-item w-full cursor-pointer text-start",
                          video.id === selectedVideoId
                            ? "menu-dropdown-item-active"
                            : "menu-dropdown-item-inactive",
                        )}
                      >
                        <PlayIcon className="size-4 shrink-0" />
                        <span className="truncate">{video.name}</span>
                      </button>
                    ))
                  )}

                  {addingVideoFor === category.id ? (
                    <div className="flex gap-1.5 px-1 py-1">
                      <Input
                        autoFocus
                        value={newVideoName}
                        onChange={(e) => setNewVideoName(e.target.value)}
                        placeholder={t("video.namePlaceholder")}
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleAddVideo(category.id)}
                        disabled={!newVideoName.trim()}
                      >
                        {t("video.addButton")}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingVideoFor(category.id);
                        setNewVideoName("");
                      }}
                      className="menu-dropdown-item menu-dropdown-item-inactive w-full cursor-pointer text-start text-gray-500"
                    >
                      <PlusIcon className="size-4 shrink-0" />
                      {t("video.addButton")}
                    </button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })
      )}

      <button
        type="button"
        onClick={() => {
          setAddingCategory(true);
          setNewCategoryName("");
        }}
        className="menu-item menu-item-inactive w-full cursor-pointer text-gray-500"
      >
        <PlusIcon className="size-4" />
        {t("category.addButton")}
      </button>

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
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddingCategory(false)}
            >
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
    </div>
  );
}
