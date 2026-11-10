import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmLeave } from "@/hooks/use-confirm-leave";
import { CheckIcon, CopyIcon, PencilIcon } from "@/icons";
import { useTranslations } from "@/i18n";
import { cn } from "@/utils";
import { useLayoutEffect, useRef, useState } from "react";
import type { TextRange } from "./frame-passage";
import type { ScriptStepState } from "./use-script-step";

/** A passage to highlight (from a clicked frame); `nonce` re-scrolls on a repeat click. */
export interface ScriptHighlight extends TextRange {
  nonce: number;
}

function formatElapsed(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Classic "digital rain" look: each column is only ~1 character wide, so
// every wrapped line is a single digit — there's no multi-char row/grid
// feel, just one continuous falling stream of bits.
function randomBitColumns(): string[] {
  return Array.from({ length: 16 }, () => {
    let bits = "";
    for (let i = 0; i < 400; i++) {
      bits += Math.random() < 0.5 ? "0" : "1";
    }
    return bits + bits;
  });
}

/** The editable script, with the "digital rain" overlay while AI is working. */
export default function ScriptEditor({
  step,
  showResultHint,
  highlight = null,
  className,
}: {
  step: ScriptStepState;
  showResultHint: boolean;
  highlight?: ScriptHighlight | null;
  className?: string;
}) {
  const t = useTranslations("videoStudio.script");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  useConfirmLeave(step.busy, t("leaveConfirm"));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(step.scriptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // A clicked frame highlights a passage in the read view — leave edit mode
  // so it's actually visible instead of hidden behind the plain textarea.
  // Adjusted directly during render (not an effect) per React's guidance on
  // resetting state in response to a prop change.
  const [lastNonce, setLastNonce] = useState(highlight?.nonce ?? null);
  if ((highlight?.nonce ?? null) !== lastNonce) {
    setLastNonce(highlight?.nonce ?? null);
    if (highlight) setEditing(false);
  }

  // Scroll the highlighted passage into view whenever a new frame is picked.
  // Only the script box scrolls: scrollIntoView would also drag the page.
  useLayoutEffect(() => {
    const view = viewRef.current;
    const mark = view?.querySelector("mark");
    if (!highlight || !view || !mark) return;
    // <mark> is inline (clientHeight is 0), so measure it with its rect.
    const markRect = mark.getBoundingClientRect();
    const offset = markRect.top - view.getBoundingClientRect().top;
    view.scrollTo({
      top: view.scrollTop + offset - (view.clientHeight - markRect.height) / 2,
      behavior: "smooth",
    });
  }, [highlight]);

  // Generated once per mount (lazy initializer), never during a re-render.
  const [scrollColumns] = useState(randomBitColumns);

  return (
    <Field className={cn("h-full min-w-0 gap-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <FieldLabel>{t("scriptLabel")}</FieldLabel>
          {showResultHint && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("scriptResultHint")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!step.scriptText}
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <>
                <CheckIcon className="size-4 text-green-500" />
                <span className="text-green-500">{t("copied")}</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-4" />
                {t("copyScript")}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditing((prev) => !prev)}
          >
            {editing ? (
              <CheckIcon className="size-4" />
            ) : (
              <PencilIcon className="size-4" />
            )}
            {editing ? t("doneEditing") : t("editScript")}
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {editing ? (
          <Textarea
            ref={textareaRef}
            autoFocus
            value={step.scriptText}
            onChange={(e) => step.setScriptText(e.target.value)}
            placeholder={t("scriptPlaceholder")}
            className="h-full resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed shadow-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent"
          />
        ) : (
          <div
            ref={viewRef}
            className="h-full overflow-y-auto px-4 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-gray-700 dark:text-gray-300"
          >
            {step.scriptText ? (
              highlight ? (
                <>
                  {step.scriptText.slice(0, highlight.start)}
                  <mark className="rounded-sm bg-brand-500/25 box-decoration-clone ring-1 ring-brand-500/40 dark:bg-brand-400/30 dark:text-white dark:ring-brand-400/50">
                    {step.scriptText.slice(highlight.start, highlight.end)}
                  </mark>
                  {step.scriptText.slice(highlight.end)}
                </>
              ) : (
                step.scriptText
              )
            ) : (
              <span className="text-gray-400 dark:text-gray-500">
                {t("scriptPlaceholder")}
              </span>
            )}
          </div>
        )}
        {step.busy && (
          <div className="absolute inset-0 overflow-hidden bg-white/85 backdrop-blur-sm dark:bg-gray-900/85">
            <div className="absolute inset-0 grid grid-cols-[repeat(16,1fr)] gap-0">
              {scrollColumns.map((bits, col) => (
                <div
                  key={col}
                  className="animate-scroll-down overflow-hidden font-jetbrains-mono text-xs leading-[1.1] font-medium break-all whitespace-pre-wrap text-gray-700/25 blur-[0.5px] dark:text-gray-200/20"
                  style={{
                    animationDuration: `${2.5 + (col % 4)}s`,
                    animationDelay: `${-col * 0.7}s`,
                  }}
                >
                  {bits}
                </div>
              ))}
            </div>
            <div className="relative flex h-full flex-col items-center justify-center gap-2">
              <video
                src={
                  step.analyzing
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
                {step.fetching
                  ? t("fetchingHint")
                  : step.transcribing
                    ? t("transcribingHint")
                    : t("analyzingHint")}
              </p>
              <p className="font-jetbrains-mono text-xs text-gray-400 dark:text-gray-500">
                {formatElapsed(step.elapsedSec)}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("doNotLeaveHint")}
              </p>
            </div>
          </div>
        )}
      </div>
      {step.scriptText && (
        <p className="border-t border-gray-200 px-4 py-1.5 text-end text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
          {t("scriptCharCount", { count: String(step.scriptText.length) })}
        </p>
      )}
    </Field>
  );
}
