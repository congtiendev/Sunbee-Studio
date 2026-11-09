import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { OverflowTabsList } from "@/components/ui/overflow-tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts";
import { useLocale, useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import {
  VIDEO_STUDIO_STEPS,
  type PromptGroup,
} from "@/pages/main/video-studio/steps/registry";
import type { VideoStudioStepKey } from "@/pages/main/video-studio/types";
import type {
  LocalizedText,
  PromptScope,
  PromptSlotInfo,
  PromptTaskInfo,
} from "@shared/types";
import { useEffect, useState } from "react";

function localized(text: LocalizedText | undefined, locale: string): string {
  if (!text) return "";
  return locale === "vi" ? text.vi : text.en;
}

/** The prompt actually used: the user's version, else the shared one, else the default. */
function effectiveContent(slot: PromptSlotInfo): string {
  return slot.userOverride ?? slot.globalOverride ?? slot.defaultContent;
}

function PromptSlotEditor({
  task,
  slot,
  isAdmin,
  onChanged,
}: {
  task: PromptTaskInfo;
  slot: PromptSlotInfo;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("settings.prompts");
  const locale = useLocale();
  const [draft, setDraft] = useState(() => effectiveContent(slot));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // Re-sync after the server copy changes (save/reset here or elsewhere).
  const serverContent = effectiveContent(slot);
  const [lastServerContent, setLastServerContent] = useState(serverContent);
  if (serverContent !== lastServerContent) {
    setLastServerContent(serverContent);
    setDraft(serverContent);
  }

  const dirty = draft !== serverContent;
  const source = slot.userOverride
    ? { label: t("sourceUser"), color: "primary" as const }
    : slot.globalOverride
      ? { label: t("sourceGlobal"), color: "warning" as const }
      : { label: t("sourceDefault"), color: "gray" as const };

  const run = async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action);
    setError(null);
    setSavedNotice(false);
    try {
      await fn();
      await onChanged();
      setSavedNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = (scope: PromptScope) =>
    run(`save-${scope}`, () =>
      apiClient.prompts.save(task.key, slot.key, draft, scope),
    );
  const reset = (scope: PromptScope) =>
    run(`reset-${scope}`, () =>
      apiClient.prompts.reset(task.key, slot.key, scope),
    );

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-800 dark:text-white/90">
          {localized(slot.label, locale)}
        </span>
        <Badge variant="light" color={source.color} size="sm">
          {source.label}
        </Badge>
      </div>
      {slot.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {localized(slot.description, locale)}
        </p>
      )}

      <Textarea
        rows={10}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSavedNotice(false);
        }}
        className="resize-y font-jetbrains-mono text-xs leading-relaxed"
      />
      <p className="text-end text-xs text-gray-400 dark:text-gray-500">
        {t("charCount", { count: String(draft.length) })}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void save("user")}
          disabled={!dirty || !draft.trim() || busy !== null}
        >
          {busy === "save-user" && <Spinner />}
          {t("save")}
        </Button>
        {dirty && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDraft(serverContent)}
            disabled={busy !== null}
          >
            {t("discard")}
          </Button>
        )}
        {slot.userOverride !== undefined && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void reset("user")}
            disabled={busy !== null}
          >
            {busy === "reset-user" && <Spinner />}
            {slot.globalOverride ? t("resetToShared") : t("resetToDefault")}
          </Button>
        )}
        {isAdmin && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void save("global")}
              disabled={
                !draft.trim() || draft === slot.globalOverride || busy !== null
              }
            >
              {busy === "save-global" && <Spinner />}
              {t("saveGlobal")}
            </Button>
            {slot.globalOverride !== undefined && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void reset("global")}
                disabled={busy !== null}
              >
                {busy === "reset-global" && <Spinner />}
                {t("resetGlobal")}
              </Button>
            )}
          </>
        )}
        {savedNotice && !dirty && (
          <span className="text-xs text-green-600 dark:text-green-400">
            {t("saved")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Whether any prompt of the task differs from its default (for the tab marker). */
function isCustomized(task: PromptTaskInfo): boolean {
  return task.prompts.some(
    (slot) =>
      slot.userOverride !== undefined || slot.globalOverride !== undefined,
  );
}

/**
 * The AI tasks of one step as tabs: task list on the side (on top on small
 * screens), the selected task's prompt editors next to it.
 */
function TaskTabs({
  tasks,
  isAdmin,
  onChanged,
}: {
  tasks: PromptTaskInfo[];
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("settings.prompts");
  const locale = useLocale();
  const [activeTask, setActiveTask] = useState(tasks[0]!.key);

  return (
    <Tabs
      orientation="vertical"
      value={activeTask}
      onValueChange={(value) => setActiveTask(value as string)}
      className="gap-6 data-[orientation=vertical]:flex-col lg:data-[orientation=vertical]:flex-row"
    >
      <TabsList variant="line" className="shrink-0 lg:w-72">
        {tasks.map((task) => (
          <TabsTrigger
            key={task.key}
            value={task.key}
            className="h-auto w-full flex-col items-start gap-0.5 py-2.5 text-start whitespace-normal"
          >
            <span className="flex w-full items-center gap-2 text-sm font-medium">
              <span className="min-w-0 flex-1">
                {localized(task.label, locale)}
              </span>
              {isCustomized(task) && (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-brand-500"
                  title={t("customizedMarker")}
                />
              )}
            </span>
            <span className="line-clamp-2 text-xs font-normal text-gray-500 dark:text-gray-400">
              {localized(task.description, locale)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {tasks.map((task) => (
        <TabsContent
          key={task.key}
          value={task.key}
          className="min-w-0 flex-1 space-y-3"
        >
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {localized(task.label, locale)}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {localized(task.description, locale)}
            </p>
          </div>
          {task.prompts.map((slot) => (
            <PromptSlotEditor
              key={slot.key}
              task={task}
              slot={slot}
              isAdmin={isAdmin}
              onChanged={onChanged}
            />
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** One task's heading and prompt editors (used where tasks are stacked, not tabbed). */
function TaskBlock({
  task,
  isAdmin,
  onChanged,
}: {
  task: PromptTaskInfo;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const locale = useLocale();
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
          {localized(task.label, locale)}
        </h3>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          {localized(task.description, locale)}
        </p>
      </div>
      {task.prompts.map((slot) => (
        <PromptSlotEditor
          key={slot.key}
          task={task}
          slot={slot}
          isAdmin={isAdmin}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}

/**
 * A step split the way its own UI is (e.g. the script sources): one tab per
 * group, titled exactly like the step's option, holding that group's tasks.
 */
function GroupTabs({
  groups,
  tasks,
  isAdmin,
  onChanged,
}: {
  groups: PromptGroup[];
  tasks: PromptTaskInfo[];
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("settings.prompts");
  const tRoot = useTranslations();
  const tCommon = useTranslations("common");
  const tasksIn = (group: string) =>
    tasks.filter((task) => task.group === group);
  // Tasks whose group isn't listed still need a home: the last tab.
  const known = new Set(groups.map((group) => group.key));
  const orphans = tasks.filter((task) => !task.group || !known.has(task.group));
  const lastGroup = groups[groups.length - 1]!.key;
  const tasksOf = (group: string) =>
    group === lastGroup ? [...tasksIn(group), ...orphans] : tasksIn(group);

  const [active, setActive] = useState(
    () =>
      groups.find((group) => tasksOf(group.key).length > 0)?.key ??
      groups[0]!.key,
  );
  const analyzeGroup = groups.find((group) => group.key === "analyze");

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as string)}>
      <OverflowTabsList
        variant="line"
        value={active}
        onValueChange={setActive}
        moreLabel={tCommon("moreTabs")}
        items={groups.map((group) => {
          const count = tasksOf(group.key).length;
          return {
            value: group.key,
            triggerClassName: "gap-1.5",
            label: (
              <>
                {tRoot(group.labelKey)}
                {count > 0 && (
                  <Badge variant="light" color="primary" size="sm">
                    {count}
                  </Badge>
                )}
              </>
            ),
          };
        })}
      />

      {groups.map((group) => {
        const groupTasks = tasksOf(group.key);
        return (
          <TabsContent
            key={group.key}
            value={group.key}
            className="space-y-8 pt-4"
          >
            {groupTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 px-6 py-8 text-center dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {group.emptyHintKey
                    ? tRoot(group.emptyHintKey, {
                        defaultValue: t("groupNoAi"),
                      })
                    : t("groupNoAi")}
                </p>
                {analyzeGroup && group.key !== analyzeGroup.key && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setActive(analyzeGroup.key)}
                  >
                    {t("openGroup", { group: tRoot(analyzeGroup.labelKey) })}
                  </Button>
                )}
              </div>
            ) : (
              groupTasks.map((task) => (
                <TaskBlock
                  key={task.key}
                  task={task}
                  isAdmin={isAdmin}
                  onChanged={onChanged}
                />
              ))
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

export default function PromptsSection() {
  const t = useTranslations("settings.prompts");
  const tCommon = useTranslations("common");
  const tSteps = useTranslations("videoStudio.steps");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [tasks, setTasks] = useState<PromptTaskInfo[] | null>(null);
  const [activeStep, setActiveStep] = useState<VideoStudioStepKey>(
    VIDEO_STUDIO_STEPS[0]!.key,
  );
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setTasks(await apiClient.prompts.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    let active = true;
    apiClient.prompts
      .list()
      .then((list) => {
        if (active) setTasks(list);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  // One tab per Video Studio step (from the step registry, so new steps appear on their own);
  // a task's `module` is the key of the step that runs it.
  const tasksOf = (step: VideoStudioStepKey) =>
    (tasks ?? []).filter((task) => task.module === step);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAdmin && (
          <Alert variant="info">
            <AlertDescription>{t("adminHint")}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!tasks && !error && <Spinner />}

        {tasks && (
          <Tabs
            value={activeStep}
            onValueChange={(value) =>
              setActiveStep(value as VideoStudioStepKey)
            }
          >
            <OverflowTabsList
              value={activeStep}
              onValueChange={(value) =>
                setActiveStep(value as VideoStudioStepKey)
              }
              moreLabel={tCommon("moreTabs")}
              items={VIDEO_STUDIO_STEPS.map((step) => {
                const count = tasksOf(step.key).length;
                const StepIcon = step.icon;
                return {
                  value: step.key,
                  triggerClassName: "gap-1.5",
                  label: (
                    <>
                      <StepIcon className="size-4" />
                      {tSteps(step.key)}
                      <Badge
                        variant="light"
                        color={count > 0 ? "primary" : "gray"}
                        size="sm"
                      >
                        {count > 0 ? count : t("soonBadge")}
                      </Badge>
                    </>
                  ),
                };
              })}
            />

            {VIDEO_STUDIO_STEPS.map((step) => {
              const stepTasks = tasksOf(step.key);
              return (
                <TabsContent key={step.key} value={step.key} className="pt-4">
                  {stepTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("comingSoonTitle", { step: tSteps(step.key) })}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t("comingSoonHint")}
                      </p>
                    </div>
                  ) : step.promptGroups ? (
                    <GroupTabs
                      groups={step.promptGroups}
                      tasks={stepTasks}
                      isAdmin={isAdmin}
                      onChanged={load}
                    />
                  ) : (
                    <TaskTabs
                      tasks={stepTasks}
                      isAdmin={isAdmin}
                      onChanged={load}
                    />
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
