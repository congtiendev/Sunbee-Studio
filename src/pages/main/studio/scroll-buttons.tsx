import { Button } from "@/components/ui/button";
import { useTranslations } from "@/i18n";
import { Spinner } from "@/components/ui/spinner";
import { ArrowDownIcon, ArrowUpIcon, FloppyDiscIcon } from "@/icons";
import { cn } from "@/utils";
import { useEffect, useState } from "react";

/** How far from either end of the page before its button shows up. */
const EDGE = 200;

/**
 * Floating "scroll to top / bottom" buttons for the long studio page. Sits
 * just above the app's corner button (bottom-end), and each one only shows
 * when there is somewhere to go.
 */
export default function ScrollButtons({
  save,
}: {
  /** Set while the open step has unsaved work: a Save button joins the stack, reachable anywhere on the page. */
  save?: { saving: boolean; onSave: () => void };
}) {
  const t = useTranslations("videoStudio.navigation");
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);

  useEffect(() => {
    const update = () => {
      const { scrollY, innerHeight } = window;
      const height = document.documentElement.scrollHeight;
      setCanUp(scrollY > EDGE);
      setCanDown(scrollY + innerHeight < height - EDGE);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // The page grows as steps load their content, without any scroll event.
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  const scrollTo = (top: number) => window.scrollTo({ top, behavior: "smooth" });
  const buttonClass =
    "card-surface rounded-full! shadow-theme-md transition-all duration-200";

  return (
    <div className="fixed end-4.5 bottom-20 z-20 flex flex-col gap-2">
      {save && (
        <Button
          type="button"
          size="icon"
          aria-label={t("save")}
          title={t("saveShortcut")}
          disabled={save.saving}
          onClick={save.onSave}
          className="relative rounded-full! shadow-theme-md"
        >
          {save.saving ? <Spinner /> : <FloppyDiscIcon className="size-4" />}
          <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white bg-amber-500 dark:border-gray-900" />
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("scrollTop")}
        title={t("scrollTop")}
        onClick={() => scrollTo(0)}
        className={cn(buttonClass, !canUp && "pointer-events-none translate-y-2 opacity-0")}
      >
        <ArrowUpIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("scrollBottom")}
        title={t("scrollBottom")}
        onClick={() => scrollTo(document.documentElement.scrollHeight)}
        className={cn(buttonClass, !canDown && "pointer-events-none -translate-y-2 opacity-0")}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    </div>
  );
}
