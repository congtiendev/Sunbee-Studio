import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/i18n";
import { SearchIcon, XIcon } from "@/icons";
import type {
  SkillType,
  TrainingCandidate,
  TrainingSourceList,
} from "@shared/types";
import { useState } from "react";
import { Link } from "react-router";
import type { SourceAdderProps } from "./adders/types";
import { TRAINING_SOURCE_UI } from "./sources";

interface SourcePickerProps {
  list: TrainingSourceList;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Passed to the kind's adder (new links, uploads, documents…). */
  ai: SourceAdderProps["ai"];
  onAdded: SourceAdderProps["onAdded"];
  /** What's being trained — some kinds word their hint differently for "editing". */
  targetType: SkillType;
  /** Items the skill already learned from: shown as included, not pickable again. */
  learnedIds?: ReadonlySet<string>;
}

/**
 * One source kind: its adder (make new material here) above a checkbox list of
 * what exists — searchable, grouped, capped at the kind's limit.
 */
export default function SourcePicker({
  list,
  selected,
  onChange,
  ai,
  onAdded,
  targetType,
  learnedIds,
}: SourcePickerProps) {
  const t = useTranslations("training.sources");
  const tKind = useTranslations(
    `training.sources.${list.kind}` as "training.sources.link",
  );
  const tBadge = useTranslations("training.badges");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const ui = TRAINING_SOURCE_UI[list.kind];
  const Icon = ui.icon;
  const Adder = ui.Adder;

  const normalized = query.trim().toLocaleLowerCase();
  const visible = list.candidates.filter(
    (c) =>
      !normalized ||
      `${c.title} ${c.group} ${c.excerpt}`
        .toLocaleLowerCase()
        .includes(normalized),
  );
  const groups = new Map<string, TrainingCandidate[]>();
  for (const candidate of visible) {
    groups.set(candidate.group, [
      ...(groups.get(candidate.group) ?? []),
      candidate,
    ]);
  }
  const isLearned = (id: string) => learnedIds?.has(id) ?? false;
  // Learned items are re-used anyway; the limit is about what this run adds.
  const picked = selected.filter((id) => !isLearned(id));
  const full = picked.length >= list.max;
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...selected, id] : selected.filter((s) => s !== id));

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <header className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-gray-800 dark:text-white/90">
              {tKind("title")}
            </h4>
            <Badge variant="light" color={full ? "warning" : "gray"} size="sm">
              {t("selected", { count: picked.length, max: list.max })}
            </Badge>
            {ui.manageTo && (
              <Link
                to={ui.manageTo}
                className="ms-auto text-xs text-brand-500 hover:underline dark:text-brand-400"
              >
                {t("manage")}
              </Link>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {list.kind === "link" && targetType === "editing"
              ? tKind("hintEditing")
              : tKind("hint")}
          </p>
        </div>
      </header>

      <Adder
        ai={ai}
        onAdded={onAdded}
        disabled={full}
        targetType={targetType}
      />

      {list.candidates.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {tKind("empty")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              {t("pickExisting", { count: list.candidates.length })}
            </Button>

            {picked.map((id) => {
              const candidate = list.candidates.find((c) => c.id === id);
              if (!candidate) return null;
              return (
                <span
                  key={id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 py-0.5 ps-2.5 pe-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  <span className="max-w-60 truncate">{candidate.title}</span>
                  <button
                    type="button"
                    onClick={() => toggle(id, false)}
                    className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
                  >
                    <XIcon className="size-3" />
                    <span className="sr-only">{t("remove")}</span>
                  </button>
                </span>
              );
            })}
          </div>

          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{tKind("title")}</DialogTitle>
              </DialogHeader>
              {list.candidates.length > 6 && (
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="ps-9"
                  />
                </div>
              )}
              <div className="custom-scrollbar max-h-96 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-800">
                {visible.length === 0 && (
                  <p className="px-2 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t("noMatch")}
                  </p>
                )}
                {[...groups.entries()].map(([group, items]) => (
                  <div key={group || "_"}>
                    {group && (
                      <p className="px-2 pb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {group}
                      </p>
                    )}
                    {items.map((candidate) => {
                      const learned = isLearned(candidate.id);
                      const checked =
                        learned || selected.includes(candidate.id);
                      return (
                        <label
                          key={candidate.id}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 has-disabled:cursor-not-allowed has-disabled:opacity-60 dark:hover:bg-white/[0.03]"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            disabled={learned || (!checked && full)}
                            onCheckedChange={(value) =>
                              toggle(candidate.id, Boolean(value))
                            }
                          />
                          {candidate.previewUrl && (
                            <img
                              src={candidate.previewUrl}
                              alt=""
                              className="size-10 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-800"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                                {candidate.title}
                              </span>
                              {learned && (
                                <Badge
                                  variant="light"
                                  color="success"
                                  size="sm"
                                >
                                  {tBadge("learned")}
                                </Badge>
                              )}
                              {candidate.badges.map((badge) => (
                                <Badge
                                  key={badge}
                                  variant="light"
                                  color="gray"
                                  size="sm"
                                >
                                  {tBadge(badge, { defaultValue: badge })}
                                </Badge>
                              ))}
                              {!candidate.previewUrl && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {t("chars", { count: candidate.charCount })}
                                </span>
                              )}
                            </span>
                            {candidate.excerpt && (
                              <span className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                                {candidate.excerpt}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setPickerOpen(false)}>
                  {t("done")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
