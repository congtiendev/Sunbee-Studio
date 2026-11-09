import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { OverflowTabsList } from "@/components/ui/overflow-tabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { CheckIcon, SearchIcon, SparkIcon } from "@/icons";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type {
  AssetCandidate,
  RequiredAsset,
  ResearchMediaType,
  ResearchSourceInfo,
  ScriptScene,
} from "@shared/types";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import CandidatePreview from "./candidate-preview";

export interface ResearchTarget {
  scene: ScriptScene;
  assetIndex: number;
  asset: RequiredAsset;
}

/** "any": no type filter (library only). */
type TabMediaType = ResearchMediaType | "any";

interface TabState {
  query: string;
  mediaType: TabMediaType;
  loading: boolean;
  error: string | null;
  candidates: AssetCandidate[] | null;
  summary?: string;
  /** Library: nothing matched the description, so the newest items are shown. */
  showingRecent?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The research media type that fits a required asset, limited to what the source offers. */
function defaultMediaType(
  asset: RequiredAsset,
  source: ResearchSourceInfo,
): TabMediaType {
  // The library is small: show everything, the user narrows it down if needed.
  if (source.kind === "library") return "any";
  const wanted: ResearchMediaType =
    asset.type === "video"
      ? "video"
      : asset.type === "audio"
        ? "audio"
        : "image";
  return source.mediaTypes.includes(wanted) ? wanted : source.mediaTypes[0]!;
}

function sceneContextOf(scene: ScriptScene): string {
  return `${scene.content} | ${scene.visualDescription}`;
}

interface ResearchSheetProps {
  target: ResearchTarget | null;
  sources: ResearchSourceInfo[];
  selected?: AssetCandidate;
  onOpenChange: (open: boolean) => void;
  onSelect: (candidate: AssetCandidate) => Promise<void>;
}

export default function ResearchSheet({
  target,
  sources,
  selected,
  onOpenChange,
  onSelect,
}: ResearchSheetProps) {
  const t = useTranslations("videoStudio.assets");
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
        <DialogHeader className="pe-10">
          <DialogTitle>{t("research.title")}</DialogTitle>
          {target && (
            <DialogDescription>
              {t("research.forScene", { index: target.scene.index })}:{" "}
              {target.asset.description}
            </DialogDescription>
          )}
        </DialogHeader>
        {target && (
          <ResearchBody
            key={`${target.scene.index}:${target.assetIndex}`}
            target={target}
            sources={sources}
            selected={selected}
            onSelect={onSelect}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResearchBody({
  target,
  sources,
  selected,
  onSelect,
}: Omit<ResearchSheetProps, "onOpenChange" | "target"> & {
  target: ResearchTarget;
}) {
  const t = useTranslations("videoStudio.assets");
  const tCommon = useTranslations("common");
  const { asset, scene } = target;
  const [active, setActive] = useState<string>(
    sources.find((s) => s.key === "claude-image-search" && s.available)?.key ??
      sources.find((s) => s.available)?.key ??
      sources[0]?.key ??
      "",
  );
  const [suggestions, setSuggestions] = useState<{
    queries: string[];
    aiUsed: boolean;
  } | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [previewCandidate, setPreviewCandidate] = useState<AssetCandidate | null>(null);
  const [tabs, setTabs] = useState<Record<string, TabState>>(() =>
    Object.fromEntries(
      sources.map((source) => [
        source.key,
        {
          // Stock sites want English keywords (filled in once suggested); the rest read the description.
          query: source.kind === "stock" ? "" : asset.description,
          mediaType: defaultMediaType(asset, source),
          loading: source.kind === "library" && source.available,
          error: null,
          candidates: null,
        },
      ]),
    ),
  );

  const patchTab = (key: string, patch: Partial<TabState>) =>
    setTabs((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));

  useEffect(() => {
    let alive = true;
    apiClient.assets
      .suggestQueries({
        description: asset.description,
        sceneContext: sceneContextOf(scene),
        mediaType:
          asset.type === "video"
            ? "video"
            : asset.type === "audio"
              ? "audio"
              : "image",
      })
      .then((result) => {
        if (!alive) return;
        setSuggestions(result);
        setTabs((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([key, tab]) => [
              key,
              sources.find((s) => s.key === key)?.kind === "stock" && !tab.query
                ? { ...tab, query: result.queries[0] ?? asset.description }
                : tab,
            ]),
          ),
        );
      })
      .catch(() => {
        if (alive)
          setSuggestions({ queries: [asset.description], aiUsed: false });
      });

    // The library is local and free: search it straight away.
    const library = sources.find((s) => s.kind === "library" && s.available);
    if (library) {
      apiClient.assets
        .research({
          sourceKey: library.key,
          query: asset.description,
        })
        .then(async (result) => {
          if (result.candidates.length > 0)
            return { candidates: result.candidates, showingRecent: false };
          const recent = await apiClient.assets.research({
            sourceKey: library.key,
            query: "",
          });
          return {
            candidates: recent.candidates,
            showingRecent: recent.candidates.length > 0,
          };
        })
        .then(({ candidates, showingRecent }) => {
          if (alive)
            patchTab(library.key, {
              loading: false,
              candidates,
              showingRecent,
            });
        })
        .catch((err) => {
          if (alive)
            patchTab(library.key, { loading: false, error: errorMessage(err) });
        });
    }
    return () => {
      alive = false;
    };
  }, [asset, scene, sources]);

  const search = async (source: ResearchSourceInfo) => {
    const tab = tabs[source.key]!;
    if (!tab.query.trim()) return;
    patchTab(source.key, { loading: true, error: null, showingRecent: false });
    try {
      const result = await apiClient.assets.research({
        sourceKey: source.key,
        query: tab.query.trim(),
        mediaType: tab.mediaType === "any" ? undefined : tab.mediaType,
        description: asset.description,
        sceneContext: sceneContextOf(scene),
      });
      patchTab(source.key, {
        loading: false,
        candidates: result.candidates,
        summary: result.summary,
      });
    } catch (err) {
      patchTab(source.key, { loading: false, error: errorMessage(err) });
    }
  };

  const choose = async (candidate: AssetCandidate) => {
    setSelecting(candidate.externalId);
    try {
      await onSelect(candidate);
    } finally {
      setSelecting(null);
    }
  };

  const isSelected = (candidate: AssetCandidate) =>
    selected?.sourceKey === candidate.sourceKey &&
    selected.externalId === candidate.externalId;

  return (
    <>
    <Tabs
      value={active}
      onValueChange={(value) => setActive(value as string)}
      className="-mx-6 flex min-h-0 flex-1 flex-col"
    >
      <div className="px-6">
        <OverflowTabsList
          variant="line"
          value={active}
          onValueChange={setActive}
          moreLabel={tCommon("moreTabs")}
          items={sources.map((source) => ({
            value: source.key,
            triggerClassName: "gap-1.5",
            label: (
              <>
                {t(`sources.${source.key}`, { defaultValue: source.label })}
                {!source.available && (
                  <span className="size-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}
              </>
            ),
          }))}
        />
      </div>

      {sources.map((source) => {
        const tab = tabs[source.key]!;
        const mediaOptions: TabMediaType[] = [
          ...(source.kind === "library" ? (["any"] as const) : []),
          ...source.mediaTypes.filter((type) => type !== "link"),
        ];
        // "ai" covers the web-link researcher, AI image generators, and AI
        // image search — only the first returns a list of links instead of
        // picturable media; of the other two, only generators create new media.
        const isLinkSource = source.mediaTypes.includes("link");
        const isGenerateSource = source.kind === "ai" && !isLinkSource && Boolean(source.generates);
        const isSearchImageSource = source.kind === "ai" && !isLinkSource && !source.generates;
        return (
          <TabsContent
            key={source.key}
            value={source.key}
            className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-6 pt-4 pb-6"
          >
            {!source.available ? (
              <Alert variant="warning">
                <AlertDescription>
                  {t(
                    source.requiresKey ? "research.needsKey" : "research.needsAiKey",
                    { source: source.label },
                  )}{" "}
                  <Link to="/settings" className="font-medium underline">
                    {t("research.openSettings")}
                  </Link>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    isGenerateSource
                      ? "research.hints.generate"
                      : isSearchImageSource
                        ? "research.hints.findImage"
                        : `research.hints.${source.kind}`,
                  )}
                </p>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void search(source);
                  }}
                >
                  <Input
                    value={tab.query}
                    onChange={(e) =>
                      patchTab(source.key, { query: e.target.value })
                    }
                    placeholder={t("research.queryPlaceholder")}
                    className="min-w-48 flex-1"
                  />
                  {mediaOptions.length > 1 && (
                    <Select
                      value={tab.mediaType}
                      onValueChange={(value) =>
                        patchTab(source.key, {
                          mediaType: value as TabMediaType,
                        })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue>
                          {() => t(`mediaTypes.${tab.mediaType}`)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {mediaOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {t(`mediaTypes.${type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    type="submit"
                    className="gap-1.5"
                    disabled={tab.loading || !tab.query.trim()}
                  >
                    {tab.loading ? (
                      <Spinner />
                    ) : (
                      <SearchIcon className="size-4" />
                    )}
                    {t(
                      isGenerateSource
                        ? "research.generateButton"
                        : isSearchImageSource
                          ? "research.findImageButton"
                          : source.kind === "ai"
                            ? "research.researchButton"
                            : "research.searchButton",
                    )}
                  </Button>
                </form>

                {source.kind === "stock" && suggestions && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      {suggestions.aiUsed && <SparkIcon className="size-3.5" />}
                      {t(
                        suggestions.aiUsed
                          ? "research.suggestedAi"
                          : "research.suggestedPlain",
                      )}
                    </span>
                    {suggestions.queries.map((query) => (
                      <button
                        key={query}
                        type="button"
                        onClick={() => patchTab(source.key, { query })}
                        className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600 hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                )}

                {tab.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{tab.error}</AlertDescription>
                  </Alert>
                )}

                {tab.showingRecent && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("research.showingRecent")}
                  </p>
                )}

                {tab.summary && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm whitespace-pre-wrap text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                    {tab.summary}
                  </div>
                )}

                {tab.candidates && tab.candidates.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={selecting !== null}
                      onClick={() => void choose(tab.candidates![0]!)}
                    >
                      {selecting === tab.candidates[0]!.externalId ? (
                        <Spinner />
                      ) : (
                        <SparkIcon className="size-3.5" />
                      )}
                      {t("research.autoSelect")}
                    </Button>
                  </div>
                )}

                {tab.loading && !tab.candidates ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : tab.candidates && tab.candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t(
                      source.kind === "library"
                        ? "research.noLibraryResults"
                        : "research.noResults",
                    )}
                  </p>
                ) : tab.candidates ? (
                  <div
                    className={cn(
                      "grid gap-3",
                      isLinkSource ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3",
                    )}
                  >
                    {tab.candidates.map((candidate) => {
                      const chosen = isSelected(candidate);
                      return (
                        <div
                          key={`${candidate.sourceKey}:${candidate.externalId}`}
                          className={cn(
                            "flex overflow-hidden rounded-xl border",
                            isLinkSource ? "flex-row items-center" : "flex-col",
                            chosen
                              ? "border-brand-500 ring-2 ring-brand-500/20"
                              : "border-gray-200 dark:border-gray-800",
                          )}
                        >
                          {isLinkSource ? (
                            <CandidatePreview
                              candidate={candidate}
                              compact
                              className="size-14 shrink-0"
                            />
                          ) : (
                            <button
                              type="button"
                              className="block w-full shrink-0 cursor-zoom-in"
                              onClick={() => setPreviewCandidate(candidate)}
                            >
                              <CandidatePreview candidate={candidate} className="aspect-video w-full" />
                            </button>
                          )}
                          <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
                            <span
                              className="truncate text-xs font-medium text-gray-800 dark:text-white/90"
                              title={candidate.title}
                            >
                              {candidate.title}
                            </span>
                            {candidate.attribution && (
                              <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                {candidate.attribution}
                              </span>
                            )}
                            {candidate.description && (
                              <span className="line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">
                                {candidate.description}
                              </span>
                            )}
                            <div className="mt-auto flex items-center gap-2 pt-1">
                              {candidate.pageUrl && (
                                <a
                                  href={candidate.pageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="truncate text-[11px] text-brand-500 hover:underline dark:text-brand-400"
                                >
                                  {t("research.openSource")}
                                </a>
                              )}
                              <Button
                                type="button"
                                size="xs"
                                variant={chosen ? "default" : "outline"}
                                className="ms-auto gap-1"
                                disabled={selecting !== null}
                                onClick={() => void choose(candidate)}
                              >
                                {selecting === candidate.externalId ? (
                                  <Spinner />
                                ) : chosen ? (
                                  <CheckIcon className="size-3.5" />
                                ) : null}
                                {t(
                                  chosen
                                    ? "research.selected"
                                    : "research.select",
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {source.kind === "stock" &&
                  tab.candidates &&
                  tab.candidates.length > 0 && (
                    <Badge variant="light" color="gray" size="sm">
                      {t("research.licenseNote", { source: source.label })}
                    </Badge>
                  )}
              </>
            )}
          </TabsContent>
        );
      })}
    </Tabs>

    <Dialog open={previewCandidate !== null} onOpenChange={(open) => !open && setPreviewCandidate(null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="line-clamp-2 pe-6">{previewCandidate?.title}</DialogTitle>
        </DialogHeader>
        {previewCandidate && (
          <img
            src={previewCandidate.previewUrl ?? previewCandidate.url}
            alt=""
            className="max-h-[70vh] w-full rounded-xl border border-gray-200 object-contain dark:border-gray-800"
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setPreviewCandidate(null)}>
            {tCommon("close")}
          </Button>
          {previewCandidate && (
            <Button
              type="button"
              className="gap-1.5"
              disabled={selecting !== null}
              onClick={() => void choose(previewCandidate)}
            >
              {selecting === previewCandidate.externalId ? (
                <Spinner />
              ) : isSelected(previewCandidate) ? (
                <CheckIcon className="size-4" />
              ) : null}
              {t(isSelected(previewCandidate) ? "research.selected" : "research.select")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
