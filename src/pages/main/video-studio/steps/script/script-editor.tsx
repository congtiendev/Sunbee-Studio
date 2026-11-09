import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { useLayoutEffect, useRef, useState } from "react";
import type { TextRange } from "./frame-passage";
import type { ScriptStepState } from "./use-script-step";

/** A passage to highlight (from a clicked frame); `nonce` re-scrolls on a repeat click. */
export interface ScriptHighlight extends TextRange {
  nonce: number;
  /** Move the caret into the textarea (false while the frame dialog is open). */
  focus: boolean;
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
}: {
  step: ScriptStepState;
  showResultHint: boolean;
  highlight?: ScriptHighlight | null;
}) {
  const t = useTranslations("videoStudio.script");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // The highlight is drawn by an overlay that mirrors the textarea's text box
  // (same padding/font/wrapping, sized to its client area so the scrollbar
  // doesn't change line breaks) and follows its scroll position.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const overlay = overlayRef.current;
    if (!highlight || !textarea || !overlay) return;

    const fit = () => {
      overlay.style.width = `${textarea.clientWidth + textarea.clientLeft * 2}px`;
      overlay.style.height = `${textarea.clientHeight + textarea.clientTop * 2}px`;
      overlay.scrollTop = textarea.scrollTop;
    };
    fit();

    const mark = overlay.querySelector("mark");
    if (mark) {
      textarea.scrollTop = Math.max(
        0,
        mark.offsetTop - textarea.clientHeight / 3,
      );
      overlay.scrollTop = textarea.scrollTop;
      if (highlight.focus) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(highlight.start, highlight.start);
        mark.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    const observer = new ResizeObserver(fit);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [highlight]);

  // Generated once per mount (lazy initializer), never during a re-render.
  const [scrollColumns] = useState(randomBitColumns);

  return (
    <Field>
      <FieldLabel>{t("scriptLabel")}</FieldLabel>
      {showResultHint && (
        <p className="-mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t("scriptResultHint")}
        </p>
      )}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          rows={20}
          value={step.scriptText}
          onChange={(e) => step.setScriptText(e.target.value)}
          onScroll={(e) => {
            if (overlayRef.current)
              overlayRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          placeholder={t("scriptPlaceholder")}
          className="resize-y text-[15px] leading-relaxed"
        />
        {highlight && (
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute start-0 top-0 overflow-hidden rounded-[10px] border border-transparent py-2.5 ps-4 pe-4 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-transparent"
          >
            {step.scriptText.slice(0, highlight.start)}
            <mark className="rounded-sm bg-brand-500/25 box-decoration-clone text-transparent ring-1 ring-brand-500/40 dark:bg-brand-400/30 dark:ring-brand-400/50">
              {step.scriptText.slice(highlight.start, highlight.end)}
            </mark>
            {step.scriptText.slice(highlight.end)}
            {/* Like a textarea, keep the height of a trailing empty line. */}
            {"\n"}
          </div>
        )}
        {step.busy && (
          <div className="absolute inset-0 overflow-hidden rounded-lg bg-white/85 backdrop-blur-sm dark:bg-gray-900/85">
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
            </div>
          </div>
        )}
      </div>
      {step.scriptText && (
        <p className="mt-1 text-end text-xs text-gray-400 dark:text-gray-500">
          {t("scriptCharCount", { count: String(step.scriptText.length) })}
        </p>
      )}
    </Field>
  );
}
