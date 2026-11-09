import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { useTranslations } from "@/i18n";
import { PencilIcon, TrashBinIcon, VerticalDotsIcon } from "@/icons";
import { cn } from "@/utils";

interface ItemActionsMenuProps {
  /** Accessible name of the trigger, e.g. the item's name. */
  label: string;
  onRename: () => void;
  onDelete: () => void;
  className?: string;
}

/** The "⋮" menu on a project, category or video: rename and delete. */
export default function ItemActionsMenu({
  label,
  onRename,
  onDelete,
  className,
}: ItemActionsMenuProps) {
  const tCommon = useTranslations("common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        // Cards behind the menu are links/buttons themselves: keep the click here.
        onClick={(e) => e.stopPropagation()}
        render={
          <button
            type="button"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200",
              className,
            )}
          />
        }
      >
        <VerticalDotsIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40 p-2">
        <DropdownMenuItem onClick={onRename}>
          <PencilIcon className="size-4" />
          {tCommon("rename")}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <TrashBinIcon className="size-4" />
          {tCommon("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
