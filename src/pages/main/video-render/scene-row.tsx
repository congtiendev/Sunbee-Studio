import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { ChevronDownIcon, PlusIcon, SparkIcon, TrashBinIcon, XIcon } from "@/icons";
import ImagePickerDialog from "@/pages/main/video-render/image-picker-dialog";
import { cn } from "@/utils";
import type { ClipTransition, FrameRatio, RenderCaptionStyle, RenderScene, ShotKind } from "@shared/types";
import { useState, type ReactNode } from "react";

const SHOT_KINDS: ShotKind[] = ["staticHold", "kenBurns", "lowerThirdCaption", "titleCard"];
const TRANSITIONS: ClipTransition[] = ["cut", "fade"];
const CAPTION_STYLES: RenderCaptionStyle[] = ["none", "lowerThird", "title"];

/** Thumbnail width per frame shape, so tall and wide pictures take a similar area. */
const THUMB_WIDTH: Record<FrameRatio, string> = {
  "16:9": "sm:w-56",
  "4:3": "sm:w-48",
  "1:1": "sm:w-40",
  "9:16": "sm:w-28",
};

function OptionSelect<T extends string>({
  label,
  value,
  options,
  labelOf,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  labelOf: (option: T) => string;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Field className="min-w-0">
      <FieldLabel className="text-xs">{label}</FieldLabel>
      <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue>{() => labelOf(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labelOf(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent dark:text-gray-500 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
    >
      {children}
    </button>
  );
}

/** One storyboard card: the picture (in the video's frame shape), on-screen text, and how the shot plays. */
export default function SceneRow({
  index,
  scene,
  frameRatio,
  isFirst,
  isLast,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  scene: RenderScene;
  frameRatio: FrameRatio;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onChange: (changes: Partial<RenderScene>) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("videoRender");
  const [picking, setPicking] = useState(false);
  const needsImage = scene.shotKind !== "titleCard";
  const missing = needsImage && !scene.imageFileId;

  return (
    <div
      id={`render-scene-${index}`}
      className="flex scroll-mt-28 flex-col gap-4 rounded-2xl border border-gray-200 p-3 transition-colors hover:border-gray-300 sm:flex-row sm:p-4 dark:border-gray-800 dark:hover:border-gray-700"
    >
      <div className={cn("flex w-full shrink-0 flex-col gap-2", THUMB_WIDTH[frameRatio])}>
        <div className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPicking(true)}
            style={{ aspectRatio: frameRatio.replace(":", " / ") }}
            className={cn(
              "group/thumb relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl transition-colors disabled:cursor-not-allowed",
              scene.imageFileId
                ? "bg-gray-900"
                : missing
                  ? "border-2 border-dashed border-amber-300 bg-amber-50 text-amber-600 hover:border-amber-400 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
                  : "border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 hover:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500",
            )}
          >
            {scene.imageFileId ? (
              <>
                <img src={`/api/files/${scene.imageFileId}`} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-medium text-white opacity-0 transition-opacity group-hover/thumb:opacity-100">
                  {t("changeImage")}
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-1 px-2 text-center text-xs font-medium">
                <PlusIcon className="size-5" />
                {needsImage ? t("pickImage") : t("titleCardNoImage")}
              </span>
            )}
          </button>
          <span className="pointer-events-none absolute start-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
            {index + 1}
          </span>
          <span className="pointer-events-none absolute end-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {scene.durationSec}s
          </span>
          {scene.imageFileId && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t("clearImage")}
              title={t("clearImage")}
              onClick={() => onChange({ imageFileId: undefined })}
              className="absolute end-2 top-2 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        {scene.imageHint && (
          <p className="flex gap-1.5 text-xs text-gray-500 dark:text-gray-400" title={scene.imageHint}>
            <SparkIcon className="mt-px size-3.5 shrink-0 text-brand-500 dark:text-brand-400" />
            <span className="line-clamp-3">{scene.imageHint}</span>
          </p>
        )}
      </div>

      <div className="@container flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {t("scene", { index: index + 1 })}
          </span>
          <div className="ms-auto flex">
            <IconAction label={t("moveUp")} disabled={disabled || isFirst} onClick={() => onMove(-1)}>
              <ChevronDownIcon className="size-4 rotate-180" />
            </IconAction>
            <IconAction label={t("moveDown")} disabled={disabled || isLast} onClick={() => onMove(1)}>
              <ChevronDownIcon className="size-4" />
            </IconAction>
            <IconAction label={t("removeScene")} disabled={disabled} onClick={onRemove}>
              <TrashBinIcon className="size-4" />
            </IconAction>
          </div>
        </div>

        <Textarea
          rows={3}
          aria-label={t("textLabel")}
          placeholder={t("textLabel")}
          className="min-h-0 resize-y"
          value={scene.text}
          disabled={disabled}
          onChange={(e) => onChange({ text: e.target.value })}
        />

        <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
          <Field className="min-w-0">
            <FieldLabel className="text-xs">{t("durationLabel")}</FieldLabel>
            <Input
              type="number"
              min={0.5}
              step={0.5}
              className="h-9"
              value={scene.durationSec}
              disabled={disabled}
              onChange={(e) => {
                const seconds = Number(e.target.value);
                if (Number.isFinite(seconds) && seconds > 0) onChange({ durationSec: seconds });
              }}
            />
          </Field>
          <OptionSelect
            label={t("shotKindLabel")}
            value={scene.shotKind}
            options={SHOT_KINDS}
            disabled={disabled}
            labelOf={(kind) => t(`shotKinds.${kind}`)}
            onChange={(shotKind) => onChange({ shotKind })}
          />
          <OptionSelect
            label={t("captionStyleLabel")}
            value={scene.captionStyle}
            options={CAPTION_STYLES}
            disabled={disabled}
            labelOf={(style) => t(`captionStyles.${style}`)}
            onChange={(captionStyle) => onChange({ captionStyle })}
          />
          <OptionSelect
            label={t("transitionOutLabel")}
            value={scene.transitionOut}
            options={TRANSITIONS}
            disabled={disabled}
            labelOf={(transition) => t(`transitions.${transition}`)}
            onChange={(transitionOut) => onChange({ transitionOut })}
          />
        </div>
      </div>

      <ImagePickerDialog
        open={picking}
        onOpenChange={setPicking}
        hint={scene.imageHint}
        onPick={(imageFileId) => onChange({ imageFileId })}
      />
    </div>
  );
}
