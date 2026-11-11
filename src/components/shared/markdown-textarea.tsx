import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "@/i18n";
import { CheckIcon, PencilIcon } from "@/icons";
import Markdown, { type Components } from "react-markdown";
import { useEffect, useRef, useState } from "react";

const MARKDOWN_COMPONENTS: Components = {
  h1: (props) => (
    <h3 className="mt-3 text-sm font-semibold text-gray-800 first:mt-0 dark:text-white/90" {...props} />
  ),
  h2: (props) => (
    <h3 className="mt-3 text-sm font-semibold text-gray-800 first:mt-0 dark:text-white/90" {...props} />
  ),
  h3: (props) => (
    <h4 className="mt-2 text-sm font-semibold text-gray-800 first:mt-0 dark:text-white/90" {...props} />
  ),
  p: (props) => <p className="mt-2 text-sm text-gray-600 first:mt-0 dark:text-gray-300" {...props} />,
  ul: (props) => (
    <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-gray-600 dark:text-gray-300" {...props} />
  ),
  ol: (props) => (
    <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-gray-600 dark:text-gray-300" {...props} />
  ),
  strong: (props) => <strong className="font-semibold text-gray-800 dark:text-white/90" {...props} />,
  code: (props) => (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-800" {...props} />
  ),
  a: (props) => (
    <a
      className="text-brand-500 hover:underline dark:text-brand-400"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="mt-2 border-s-2 border-gray-300 ps-3 text-sm text-gray-500 italic dark:border-gray-700 dark:text-gray-400"
      {...props}
    />
  ),
};

interface MarkdownTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Preview-only, no edit button — for content generated elsewhere (e.g. by training) rather than typed by hand. */
  readOnly?: boolean;
}

/**
 * Shows a Markdown preview by default (click-to-edit, like an inline-editable
 * field) — the pencil button switches to a plain textarea, a check button
 * switches back. Stays plain text in storage and whatever's sent to the AI;
 * the preview is read-only, rendering-only sugar.
 */
export default function MarkdownTextarea({
  value,
  onChange,
  rows = 10,
  placeholder,
  className,
  readOnly = false,
}: MarkdownTextareaProps) {
  const t = useTranslations("common.markdownEditor");
  // Nothing to preview yet: start right in edit mode instead of an empty box.
  const [editing, setEditing] = useState(() => !readOnly && !value.trim());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  if (editing && !readOnly) {
    return (
      <div className="relative">
        <Textarea
          ref={textareaRef}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          title={t("preview")}
          className="absolute end-2 top-2 rounded-full bg-white/90 shadow-theme-sm backdrop-blur-sm dark:bg-gray-900/80"
          onClick={() => setEditing(false)}
        >
          <CheckIcon className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={`custom-scrollbar overflow-y-auto rounded-[10px] border border-gray-300 bg-white px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900 ${readOnly ? "" : "pe-10"}`}
        style={{ minHeight: `${rows * 1.6}rem` }}
      >
        {value.trim() ? (
          <Markdown components={MARKDOWN_COMPONENTS}>{value}</Markdown>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">{placeholder}</p>
        )}
      </div>
      {!readOnly && (
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          title={t("edit")}
          className="absolute end-2 top-2 rounded-full bg-white/90 shadow-theme-sm backdrop-blur-sm dark:bg-gray-900/80"
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
