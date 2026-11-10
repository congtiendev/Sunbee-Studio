import { useEffect } from "react";

/**
 * While `active`, warns before the tab/window closes or reloads, and asks for
 * confirmation before any in-app link navigates away — so a long-running AI
 * call (script fetch/analysis) isn't silently abandoned mid-flight.
 */
export function useConfirmLeave(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, message]);
}
