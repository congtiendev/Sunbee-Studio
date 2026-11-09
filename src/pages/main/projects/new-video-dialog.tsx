import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "@/i18n";
import { apiClient } from "@/lib/api-client";
import { studioUrl } from "@/lib/paths";
import type { Category, Project } from "@shared/types";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

interface NewVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects this project (e.g. when opened from a project page). */
  defaultProjectId?: string;
  /** Preselects this category, when it belongs to the selected project. */
  defaultCategoryId?: string;
}

/**
 * Creates a video — and, if asked, its project and category on the way — then
 * opens it in the studio. The one entry point for "start a new video".
 */
export default function NewVideoDialog({
  open,
  onOpenChange,
  ...props
}: NewVideoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so each opening starts fresh. */}
        {open && (
          <NewVideoForm onClose={() => onOpenChange(false)} {...props} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A select of existing items that can switch to a text field for a new one. */
interface PickOrCreate {
  /** The picked id, when not creating. */
  id: string | null;
  /** The new item's name, or null when picking an existing one. */
  newName: string | null;
}

function NewVideoForm({
  defaultProjectId,
  defaultCategoryId,
  onClose,
}: Omit<NewVideoDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void;
}) {
  const t = useTranslations("projects.newVideo");
  const tCommon = useTranslations("common");
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [loadedCategories, setLoadedCategories] = useState<{
    projectId: string;
    list: Category[];
  } | null>(null);
  const [project, setProject] = useState<PickOrCreate>({
    id: null,
    newName: null,
  });
  const [category, setCategory] = useState<PickOrCreate>({
    id: null,
    newName: null,
  });
  const [videoName, setVideoName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.projects
      .list()
      .then((list) => {
        if (!active) return;
        setProjects(list);
        const preferred =
          list.find((p) => p.id === defaultProjectId) ?? list[0];
        if (preferred) {
          setProject({ id: preferred.id, newName: null });
        } else {
          // No projects yet: both the project and its category are new.
          setProject({ id: null, newName: "" });
          setCategory({ id: null, newName: "" });
        }
      })
      .catch(
        (err) =>
          active && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      active = false;
    };
  }, [defaultProjectId]);

  // Categories follow the picked project.
  useEffect(() => {
    const projectId = project.id;
    if (!projectId) return;
    let active = true;
    apiClient.categories
      .list(projectId)
      .then((list) => {
        if (!active) return;
        setLoadedCategories({ projectId, list });
        const preferred =
          list.find((c) => c.id === defaultCategoryId) ?? list[0];
        setCategory(
          preferred
            ? { id: preferred.id, newName: null }
            : { id: null, newName: "" },
        );
      })
      .catch(
        (err) =>
          active && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      active = false;
    };
  }, [project.id, defaultCategoryId]);

  // A new project has no categories; null while the picked project's are loading.
  const categories: Category[] | null =
    project.id === null
      ? []
      : loadedCategories?.projectId === project.id
        ? loadedCategories.list
        : null;

  const handleProjectChange = (next: PickOrCreate) => {
    setProject(next);
    // A new project needs a new category too.
    if (next.id === null) setCategory({ id: null, newName: "" });
  };

  const isReady = (choice: PickOrCreate) =>
    choice.newName !== null
      ? choice.newName.trim().length > 0
      : choice.id !== null;
  const canSubmit =
    !submitting &&
    categories !== null && // never submit a category left over from the previous project
    isReady(project) &&
    isReady(category) &&
    videoName.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const projectId =
        project.newName !== null
          ? (await apiClient.projects.create(project.newName.trim())).id
          : project.id!;
      const categoryId =
        category.newName !== null
          ? (
              await apiClient.categories.create(
                projectId,
                category.newName.trim(),
              )
            ).id
          : category.id!;
      const video = await apiClient.videos.create(categoryId, videoName.trim());
      onClose();
      void navigate(studioUrl(video.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  if (!projects) {
    return (
      <div className="flex justify-center py-10">
        {error ? (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <PickOrCreateField
        label={t("project")}
        items={projects}
        value={project}
        onChange={handleProjectChange}
        newPlaceholder={t("newProjectPlaceholder")}
      />

      {categories === null ? (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      ) : (
        <PickOrCreateField
          label={t("category")}
          items={categories}
          value={category}
          onChange={setCategory}
          newPlaceholder={t("newCategoryPlaceholder")}
        />
      )}

      <Field>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input
          value={videoName}
          onChange={(e) => setVideoName(e.target.value)}
          placeholder={t("name")}
        />
      </Field>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onClose}
        >
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {submitting && <Spinner />}
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PickOrCreateField({
  label,
  items,
  value,
  onChange,
  newPlaceholder,
}: {
  label: string;
  items: { id: string; name: string }[];
  value: PickOrCreate;
  onChange: (value: PickOrCreate) => void;
  newPlaceholder: string;
}) {
  const t = useTranslations("projects.newVideo");
  const creating = value.newName !== null;

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{label}</FieldLabel>
        {/* Nothing to pick from: creating is the only option. */}
        {items.length > 0 && (
          <button
            type="button"
            className="text-xs font-medium text-brand-500 hover:underline dark:text-brand-400"
            onClick={() =>
              onChange(
                creating
                  ? { id: items[0]!.id, newName: null }
                  : { id: null, newName: "" },
              )
            }
          >
            {creating ? t("pickExisting") : t("createNew")}
          </button>
        )}
      </div>
      {creating ? (
        <Input
          value={value.newName ?? ""}
          onChange={(e) => onChange({ id: null, newName: e.target.value })}
          placeholder={newPlaceholder}
        />
      ) : (
        <Select
          value={value.id ?? undefined}
          onValueChange={(id) => onChange({ id: id as string, newName: null })}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {() => items.find((item) => item.id === value.id)?.name ?? ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
