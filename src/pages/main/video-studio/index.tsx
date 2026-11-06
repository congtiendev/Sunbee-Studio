import { PageBreadcrumb } from "@/components/shared/page-breadcrumb";
import { PageMeta } from "@/components/shared/page-meta";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  LayerIcon,
  LayoutIcon,
  TextIcon,
} from "@/icons";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import type { Project } from "@shared/types";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import ProjectTree from "@/pages/main/video-studio/project-tree";
import PlaceholderStep from "@/pages/main/video-studio/steps/placeholder-step";
import ScriptStep from "@/pages/main/video-studio/steps/script-step";
import Stepper from "@/pages/main/video-studio/stepper";
import type { VideoStudioStepKey } from "@/pages/main/video-studio/types";

const CREATE_NEW = "__create_new__";

export default function VideoStudioPage() {
  const t = useTranslations("videoStudio");

  const steps = [
    {
      key: "script" as VideoStudioStepKey,
      label: t("steps.script"),
      hint: t("steps.scriptHint"),
      icon: TextIcon,
    },
    {
      key: "assets" as VideoStudioStepKey,
      label: t("steps.assets"),
      hint: t("steps.assetsHint"),
      icon: LayerIcon,
    },
    {
      key: "editPlan" as VideoStudioStepKey,
      label: t("steps.editPlan"),
      hint: t("steps.editPlanHint"),
      icon: LayoutIcon,
    },
    {
      key: "render" as VideoStudioStepKey,
      label: t("steps.render"),
      hint: t("steps.renderHint"),
      icon: DownloadIcon,
    },
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [scriptReady, setScriptReady] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    () => searchParams.get("project"),
  );
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(
    () => searchParams.get("video"),
  );
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingSubmitting, setCreatingSubmitting] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  const syncUrl = (projectId: string | null, videoId: string | null) => {
    const next = new URLSearchParams();
    if (projectId) next.set("project", projectId);
    if (videoId) next.set("video", videoId);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let active = true;
    apiClient.projects
      .list()
      .then((data) => {
        if (!active) return;
        setProjects(data);
        if (currentProjectId && data.some((p) => p.id === currentProjectId)) {
          return;
        }
        if (data.length > 0) {
          setCurrentProjectId(data[0]!.id);
          setCurrentVideoId(null);
          syncUrl(data[0]!.id, null);
        }
      })
      .catch((err) => {
        if (active) setProjectError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreatingSubmitting(true);
    setProjectError(null);
    try {
      const project = await apiClient.projects.create(name);
      setProjects((prev) => [project, ...prev]);
      setCurrentProjectId(project.id);
      setCurrentVideoId(null);
      syncUrl(project.id, null);
      setProjectDialogOpen(false);
      setNewProjectName("");
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSubmitting(false);
    }
  };

  const handleSelectProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    setCurrentVideoId(null);
    setActiveIndex(0);
    setFurthestIndex(0);
    setScriptReady(false);
    syncUrl(projectId, null);
  };

  const handleSelectVideo = (videoId: string) => {
    setCurrentVideoId(videoId);
    setActiveIndex(0);
    setFurthestIndex(0);
    setScriptReady(false);
    syncUrl(currentProjectId, videoId);
  };

  const isLastStep = activeIndex === steps.length - 1;
  const canGoNext = activeIndex === 0 ? scriptReady : true;

  const goToStep = (index: number) => {
    if (index > furthestIndex) return;
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (!canGoNext || isLastStep) return;
    const nextIndex = activeIndex + 1;
    setActiveIndex(nextIndex);
    setFurthestIndex((prev) => Math.max(prev, nextIndex));
  };

  const handleBack = () => {
    if (activeIndex === 0) return;
    setActiveIndex(activeIndex - 1);
  };

  const activeKey = steps[activeIndex].key;
  const currentProjectName = projects.find((p) => p.id === currentProjectId)?.name ?? "";

  return (
    <div>
      <PageMeta title={t("metaTitle")} description={t("metaDescription")} />
      <PageBreadcrumb pageTitle={t("title")} />

      {projectError && (
        <p className="mb-4 text-sm text-error-500">{projectError}</p>
      )}

      {!projectsLoading && projects.length === 0 ? (
        <Card className="items-center gap-4 py-12 text-center">
          <FolderIcon className="size-10 text-gray-400 dark:text-gray-600" />
          <CardTitle>{t("project.emptyTitle")}</CardTitle>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {t("project.emptyDescription")}
          </p>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={t("project.namePlaceholder")}
              className="w-64"
            />
            <Button
              type="button"
              onClick={() => void handleCreateProject()}
              disabled={!newProjectName.trim() || creatingSubmitting}
            >
              {creatingSubmitting && <Spinner />}
              {t("project.createButton")}
            </Button>
          </div>
        </Card>
      ) : currentProjectId ? (
        <div className="flex items-start gap-5">
          <Card className="sticky top-24 max-h-[calc(100vh-7rem)] w-72 shrink-0 gap-3 overflow-y-auto p-4">
            <div className="flex items-center gap-2">
              <Select
                value={currentProjectId ?? undefined}
                onValueChange={(value) => {
                  if (value === CREATE_NEW) {
                    setNewProjectName("");
                    setProjectDialogOpen(true);
                    return;
                  }
                  handleSelectProject(value as string);
                }}
              >
                <SelectTrigger className="flex-1">
                  <FolderIcon className="size-4 shrink-0" />
                  <SelectValue>{() => currentProjectName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={CREATE_NEW}>
                    {t("project.createNewOption")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="-mx-4 border-t border-gray-100 dark:border-gray-800" />

            <ProjectTree
              key={currentProjectId}
              projectId={currentProjectId}
              selectedVideoId={currentVideoId}
              onSelectVideo={handleSelectVideo}
            />
          </Card>

          <div className="min-w-0 flex-1">
            {currentVideoId ? (
              <>
                <Card className="relative gap-0 pt-14 sm:pt-16">
                  <div className="absolute inset-x-5 -top-[18px] z-10 sm:inset-x-6">
                    <Stepper
                      steps={steps}
                      activeIndex={activeIndex}
                      furthestIndex={furthestIndex}
                      onStepClick={goToStep}
                    />
                  </div>

                  <div className="border-t border-gray-100 pt-6 dark:border-gray-800">
                    {activeKey === "script" && (
                      <ScriptStep
                        videoId={currentVideoId}
                        onAnalyzed={() => setScriptReady(true)}
                      />
                    )}
                    {activeKey === "assets" && (
                      <PlaceholderStep title={t("comingSoon")} />
                    )}
                    {activeKey === "editPlan" && (
                      <PlaceholderStep title={t("comingSoon")} />
                    )}
                    {activeKey === "render" && (
                      <PlaceholderStep title={t("comingSoon")} />
                    )}
                  </div>
                </Card>

                <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5 dark:border-gray-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={activeIndex === 0}
                    className="gap-1.5"
                  >
                    <ChevronLeftIcon className="size-4 rtl:rotate-180" />
                    {t("navigation.back")}
                  </Button>

                  {!isLastStep && (
                    <Button
                      type="button"
                      onClick={handleNext}
                      disabled={!canGoNext}
                      className="gap-1.5"
                    >
                      {t("navigation.next")}
                      <ChevronRightIcon className="size-4 rtl:rotate-180" />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <Card className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("video.selectHint")}
              </Card>
            )}
          </div>
        </div>
      ) : null}

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("project.createButton")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder={t("project.namePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateProject();
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjectDialogOpen(false)}
            >
              {t("navigation.back")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateProject()}
              disabled={!newProjectName.trim() || creatingSubmitting}
            >
              {creatingSubmitting && <Spinner />}
              {t("project.createButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
