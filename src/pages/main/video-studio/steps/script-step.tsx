import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClaudeIcon, ClockIcon, GptIcon, StarFilledIcon, TrashBinIcon, UploadIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/utils";
import type {
  ScriptAnalysisRecord,
  ScriptAnalyzeResult,
  StyleTemplate,
} from "@shared/types";
import {
  ANALYZE_MODELS,
  defaultModelFor,
  estimateAnalyzeScriptCost,
  type AnalyzeProvider,
} from "@shared/script-cost-estimate";
import { useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import VersionSheet from "@/pages/main/video-studio/version-sheet";
import ScriptChecklist, { computeScriptChecklist } from "./script-checklist";

type SourceMode = "link" | "upload" | "import";

const NO_TEMPLATE = "__none__";
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ScriptStep({
  videoId,
  onAnalyzed,
}: {
  videoId: string;
  onAnalyzed?: () => void;
}) {
  const t = useTranslations("videoStudio.script");

  const [mode, setMode] = useState<SourceMode>("link");
  const [url, setUrl] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScriptAnalyzeResult | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [styleTemplates, setStyleTemplates] = useState<StyleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(NO_TEMPLATE);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [provider, setProvider] = useState<AnalyzeProvider>("openai");
  const [model, setModel] = useState<string>(defaultModelFor("openai"));
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [availableProviders, setAvailableProviders] = useState<
    Record<AnalyzeProvider, boolean>
  >({ openai: true, claude: true });
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [versionSheetOpen, setVersionSheetOpen] = useState(false);

  const handleProviderChange = (next: AnalyzeProvider) => {
    setProvider(next);
    setModel(defaultModelFor(next));
  };

  useEffect(() => {
    let active = true;
    apiClient.templates
      .list()
      .then((templates) => {
        if (active) setStyleTemplates(templates);
      })
      .catch(() => {
        // Non-critical: the style-template picker just stays empty.
      });
    apiClient.settings
      .get()
      .then((settings) => {
        if (!active) return;
        setAvailableProviders({
          openai: Boolean(settings.openaiApiKey),
          claude: Boolean(settings.anthropicApiKey),
        });
        if (!settings.openaiApiKey && settings.anthropicApiKey) {
          handleProviderChange("claude");
        }
      })
      .catch(() => {
        // Non-critical: provider selector just assumes both are available.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiClient.script
      .history(videoId)
      .then((data) => {
        if (!active) return;
        if (data.length > 0) handleLoadVersion(data[0]!);
        else {
          setCurrentVersionId(null);
          setScriptText("");
          setFrames([]);
          setResult(null);
        }
      })
      .catch(() => {
        // Non-critical: start from a blank script for this video.
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const handleLoadVersion = (record: ScriptAnalysisRecord) => {
    setError(null);
    setCurrentVersionId(record.id);
    setScriptText(record.scriptText);
    setFrames(record.frames);
    setUploadFile(null);
    if (record.sourceType === "youtube" && record.sourceUrl) {
      setMode("link");
      setUrl(record.sourceUrl);
    } else {
      setMode("import");
      setUrl("");
    }
    setResult(
      record.kind === "analyzed" && record.style
        ? { scenes: record.scenes, resources: record.resources, style: record.style }
        : null,
    );
    setTemplateName("");
    setTemplateSaved(false);
  };

  const costEstimate = useMemo(
    () =>
      scriptText
        ? estimateAnalyzeScriptCost(scriptText, frames.length, provider, model)
        : null,
    [scriptText, frames.length, provider, model],
  );

  const scrollColumns = useMemo(() => {
    // Dense binary "data stream" look — one continuous wrapped string per
    // column (no per-line gaps), duplicated once for a seamless scroll loop.
    return [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
      // Generous length so every column's duplicated content comfortably
      // covers more than 2x the overlay's height at any wrap width/line
      // height, so the scroll loop never shows a blank tail.
      let bits = "";
      for (let i = 0; i < 2000; i++) {
        bits += Math.random() < 0.5 ? "0" : "1";
      }
      return bits + bits;
    });
  }, []);

  const handleFetch = async () => {
    setError(null);
    setFetching(true);
    setFrames([]);
    try {
      const res = await apiClient.script.fetchTranscript({ url, videoId });
      setScriptText(res.scriptText);
      setFrames(res.frames ?? []);
      setCurrentVersionId(res.versionId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } =
    useDropzone({
      onDrop: (accepted) => setUploadFile(accepted[0] ?? null),
      accept: {
        "video/mp4": [".mp4"],
        "video/webm": [".webm"],
        "video/quicktime": [".mov"],
      },
      maxSize: MAX_UPLOAD_BYTES,
      maxFiles: 1,
    });

  const handleTranscribeUpload = async () => {
    if (!uploadFile) return;
    setError(null);
    setTranscribing(true);
    setFrames([]);
    try {
      const res = await apiClient.script.transcribeUpload(uploadFile, videoId);
      setScriptText(res.scriptText);
      setFrames(res.frames ?? []);
      setCurrentVersionId(res.versionId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTranscribing(false);
    }
  };

  const handleAnalyze = async () => {
    setError(null);
    setAnalyzing(true);
    setResult(null);
    setTemplateName("");
    setTemplateSaved(false);
    try {
      const res = await apiClient.script.analyze({
        scriptText,
        sourceType: mode === "link" ? "youtube" : "import",
        sourceUrl: mode === "link" ? url : undefined,
        styleTemplateId:
          selectedTemplateId === NO_TEMPLATE ? undefined : selectedTemplateId,
        frames,
        provider,
        model,
        effort,
        videoId,
      });
      setResult(res);
      setCurrentVersionId(res.versionId);
      onAnalyzed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!result || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const totalDurationSec = result.scenes.reduce(
        (sum, scene) => sum + scene.estimatedDurationSec,
        0,
      );
      const avgShotLengthSec =
        result.scenes.length > 0 ? totalDurationSec / result.scenes.length : 0;
      const cutsPerMinute =
        totalDurationSec > 0
          ? (result.scenes.length / totalDurationSec) * 60
          : 0;

      await apiClient.templates.save({
        name: templateName.trim(),
        genre: result.style.genre,
        styleTags: result.style.styleTags,
        toneDescription: result.style.toneDescription,
        pacing: { avgShotLengthSec, cutsPerMinute },
        resourceInventory: { ...result.resources },
      });
      setTemplateSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTemplate(false);
    }
  };

  const checklist = result ? computeScriptChecklist(result) : null;
  const checklistLabels = {
    hasScenes: t("checklist.hasScenes"),
    sceneDurationSane: t("checklist.sceneDurationSane"),
    resourcesFilled: t("checklist.resourcesFilled"),
    scenesHaveAssets: t("checklist.scenesHaveAssets"),
  };

  return (
    <div>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("sourceTitle")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setVersionSheetOpen(true)}
          >
            <ClockIcon className="size-4" />
            {t("history.openButton")}
          </Button>
        </div>
        <VersionSheet
          open={versionSheetOpen}
          onOpenChange={setVersionSheetOpen}
          videoId={videoId}
          currentVersionId={currentVersionId}
          onSelect={handleLoadVersion}
        />

        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as SourceMode)}
          className="flex flex-wrap items-center gap-6"
        >
          <Field orientation="horizontal" className="w-auto gap-2.5">
            <RadioGroupItem id="script-source-link" value="link" />
            <Label htmlFor="script-source-link" className="cursor-pointer">
              {t("fromLink")}
            </Label>
          </Field>
          <Field orientation="horizontal" className="w-auto gap-2.5">
            <RadioGroupItem id="script-source-upload" value="upload" />
            <Label htmlFor="script-source-upload" className="cursor-pointer">
              {t("uploadVideo")}
            </Label>
          </Field>
          <Field orientation="horizontal" className="w-auto gap-2.5">
            <RadioGroupItem id="script-source-import" value="import" />
            <Label htmlFor="script-source-import" className="cursor-pointer">
              {t("importScript")}
            </Label>
          </Field>
        </RadioGroup>

        {mode === "link" && (
          <Field>
            <FieldLabel>{t("urlLabel")}</FieldLabel>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("urlPlaceholder")}
              />
              <Button
                type="button"
                onClick={() => void handleFetch()}
                disabled={!url || fetching}
              >
                {fetching && <Spinner />}
                {t("fetchButton")}
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              {fetching ? t("fetchingHint") : t("linkCaptionHint")}
            </p>
          </Field>
        )}

        {mode === "upload" && (
          <Field>
            <FieldLabel>{t("uploadVideo")}</FieldLabel>
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-7 text-center outline-hidden transition-all duration-200",
                isDragReject
                  ? "border-red-500 bg-red-50/60 dark:bg-red-950/20"
                  : isDragAccept
                    ? "border-brand-500 bg-brand-50/60 dark:bg-brand-950/20"
                    : "border-gray-300 bg-gray-50 hover:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500",
              )}
            >
              <input {...getInputProps()} />
              <UploadIcon className="mb-3 size-7 text-gray-500 dark:text-gray-400" />
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {isDragActive ? t("uploadDropActive") : t("uploadDropHint")}
              </p>
            </div>

            {uploadFile && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-gray-700 dark:text-gray-300">
                    {uploadFile.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(uploadFile.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadFile(null)}
                  className="shrink-0 text-gray-400 hover:text-red-500"
                  aria-label={t("uploadRemove")}
                >
                  <TrashBinIcon className="size-4" />
                </button>
              </div>
            )}

            <Button
              type="button"
              className="mt-3"
              onClick={() => void handleTranscribeUpload()}
              disabled={!uploadFile || transcribing}
            >
              {transcribing && <Spinner />}
              {t("uploadButton")}
            </Button>
            {transcribing && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {t("transcribingHint")}
              </p>
            )}
          </Field>
        )}

        <Field>
          <FieldLabel>{t("scriptLabel")}</FieldLabel>
          {mode !== "import" && (
            <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("scriptResultHint")}
            </p>
          )}
          <div className="relative">
            <Textarea
              rows={20}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder={t("scriptPlaceholder")}
              className="resize-y text-[15px] leading-relaxed"
            />
            {(fetching || transcribing || analyzing) && (
              <div className="absolute inset-0 overflow-hidden rounded-lg bg-white/85 backdrop-blur-sm dark:bg-gray-900/85">
                <div className="absolute inset-0 grid grid-cols-8 gap-0">
                  {scrollColumns.map((bits, col) => (
                    <div
                      key={col}
                      className={cn(
                        "overflow-hidden font-jetbrains-mono text-sm leading-[0.85] font-medium break-all whitespace-pre-wrap blur-[0.5px] text-gray-700/25 dark:text-gray-200/20",
                        col % 2 === 0 ? "animate-scroll-up" : "animate-scroll-down",
                      )}
                      style={{
                        animationDuration: `${3.5 + (col % 3)}s`,
                        animationDelay: `${-col * 1.3}s`,
                      }}
                    >
                      {bits}
                    </div>
                  ))}
                </div>
                <div className="relative flex h-full flex-col items-center justify-center gap-2">
                  <video
                    src={
                      analyzing
                        ? "/images/video-studio/loading-analyze-script.webm"
                        : "/images/video-studio/loading-analyze-video.webm"
                    }
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-56 w-56"
                  />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {fetching
                      ? t("fetchingHint")
                      : transcribing
                        ? t("transcribingHint")
                        : t("analyzingHint")}
                  </p>
                </div>
              </div>
            )}
          </div>
          {scriptText && (
            <p className="mt-1 text-end text-xs text-gray-400 dark:text-gray-500">
              {t("scriptCharCount", { count: String(scriptText.length) })}
            </p>
          )}
        </Field>

        {frames.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {t("framesCaptured", { count: String(frames.length) })}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {frames.map((frame, i) => (
                <img
                  key={i}
                  src={frame}
                  alt=""
                  className="h-16 w-28 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-800"
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <Field className="w-auto">
            <FieldLabel>{t("providerLabel")}</FieldLabel>
            <Tabs
              value={provider}
              onValueChange={(value) => handleProviderChange(value as AnalyzeProvider)}
            >
              <TabsList>
                <TabsTrigger value="openai" className="gap-1.5" disabled={!availableProviders.openai}>
                  <GptIcon className="size-4" />
                  {t("providerOpenai")}
                </TabsTrigger>
                <TabsTrigger value="claude" className="gap-1.5" disabled={!availableProviders.claude}>
                  <ClaudeIcon className="size-4" />
                  {t("providerClaude")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>

          <Field className="w-56">
            <FieldLabel>{t("modelLabel")}</FieldLabel>
            <Select value={model} onValueChange={(value) => setModel(value as string)}>
              <SelectTrigger>
                <SelectValue>
                  {() => ANALYZE_MODELS[provider].find((m) => m.id === model)?.label ?? model}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ANALYZE_MODELS[provider].map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field className="w-40">
            <FieldLabel>{t("effortLabel")}</FieldLabel>
            <Select
              value={effort}
              onValueChange={(value) => setEffort(value as "low" | "medium" | "high")}
            >
              <SelectTrigger>
                <SelectValue>
                  {() =>
                    ({ low: t("effortLow"), medium: t("effortMedium"), high: t("effortHigh") })[
                      effort
                    ]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("effortLow")}</SelectItem>
                <SelectItem value="medium">{t("effortMedium")}</SelectItem>
                <SelectItem value="high">{t("effortHigh")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {!availableProviders.openai || !availableProviders.claude ? (
          <p className="-mt-3 text-xs text-gray-500 dark:text-gray-400">
            {t("providerMissingKeyHint")}
          </p>
        ) : null}

        {styleTemplates.length > 0 && (
          <Field>
            <FieldLabel>{t("styleTemplateLabel")}</FieldLabel>
            <Select
              value={selectedTemplateId}
              onValueChange={(value) => setSelectedTemplateId(value as string)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("styleTemplatePlaceholder")}>
                  {() =>
                    selectedTemplateId === NO_TEMPLATE
                      ? t("styleTemplateNone")
                      : (styleTemplates.find((tpl) => tpl.id === selectedTemplateId)?.name ??
                        t("styleTemplatePlaceholder"))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>
                  {t("styleTemplateNone")}
                </SelectItem>
                {styleTemplates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={!scriptText || analyzing}
          >
            {analyzing && <Spinner />}
            {t("analyzeButton")}
          </Button>

          {costEstimate && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("costEstimate", {
                amount: costEstimate.estimatedCostUsd.toFixed(4),
                confidence: t(`confidence.${costEstimate.confidence}`),
              })}
            </span>
          )}
        </div>
      </div>

      {result && (
        <>
          {checklist && (
            <div className="mt-6 space-y-3 border-t border-gray-100 pt-6 dark:border-gray-800">
              <CardTitle>{t("checklistTitle")}</CardTitle>
              <ScriptChecklist items={checklist} labels={checklistLabels} />
            </div>
          )}

          <div className="mt-6 space-y-4 border-t border-gray-100 pt-6 dark:border-gray-800">
            <CardTitle>{t("scenesTitle")}</CardTitle>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                  <TableRow>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      #
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {t("sceneContent")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {t("sceneVisual")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {t("sceneShot")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {t("sceneAssets")}
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-4 py-3 text-start text-xs font-medium text-gray-500 dark:text-gray-400"
                    >
                      {t("sceneDuration")}
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {result.scenes.map((scene) => (
                    <TableRow key={scene.index}>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          {scene.index}
                          {scene.heroMoment && (
                            <StarFilledIcon className="size-3.5 text-yellow-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-700 dark:text-gray-300">
                        <Badge variant="light" color="primary" size="sm" className="mb-1.5">
                          {t(`narrativeRoles.${scene.narrativeRole}`)}
                        </Badge>
                        <div>{scene.content}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-500 dark:text-gray-400">
                        {scene.visualDescription}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-500 dark:text-gray-400">
                        {t(`shotSizes.${scene.shotSize}`)} ·{" "}
                        {t(`cameraMovements.${scene.cameraMovement}`)}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex flex-col gap-1">
                          {scene.requiredAssets.map((asset, i) => (
                            <Badge key={i} variant="light" color="gray" size="sm">
                              {asset.description}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-gray-500 dark:text-gray-400">
                        {scene.estimatedDurationSec}s
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-gray-100 pt-6 dark:border-gray-800">
            <CardTitle>{t("resourcesTitle")}</CardTitle>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>
                <strong>{t("shotCount")}:</strong> {result.resources.shotCount}
              </li>
              <li>
                <strong>{t("voiceover")}:</strong> {result.resources.voiceover}
              </li>
              <li>
                <strong>{t("music")}:</strong> {result.resources.music}
              </li>
              <li>
                <strong>{t("images")}:</strong>{" "}
                {result.resources.images.join(", ")}
              </li>
              <li>
                <strong>{t("notes")}:</strong> {result.resources.notes}
              </li>
            </ul>
          </div>

          <div className="mt-6 space-y-4 border-t border-gray-100 pt-6 dark:border-gray-800">
            <CardTitle>{t("saveSkillTitle")}</CardTitle>
            <Field>
              <FieldLabel>{t("skillNameLabel")}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t("skillNamePlaceholder")}
                />
                <Button
                  type="button"
                  onClick={() => void handleSaveTemplate()}
                  disabled={!templateName.trim() || savingTemplate}
                >
                  {savingTemplate && <Spinner />}
                  {t("saveSkillButton")}
                </Button>
              </div>
            </Field>

            {templateSaved && (
              <Alert variant="success">
                <AlertDescription>{t("skillSaved")}</AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}
    </div>
  );
}
