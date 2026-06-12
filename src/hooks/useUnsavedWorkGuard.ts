import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Guards in-progress wizard work against accidental loss: warns on tab
 * close/refresh (`beforeunload`) and confirms in-app route changes (header
 * logo, "Continue to …" links) while `hasWork` is true.
 *
 * Returns `allowNavigation`, which lifts the in-app guard for the next
 * navigation — call it right before an intentional `navigate(...)` so the
 * user isn't prompted twice.
 */
export function useUnsavedWorkGuard(hasWork: boolean): { allowNavigation: () => void } {
  const allowedRef = useRef(false);

  const blocker = useBlocker(() => hasWork && !allowedRef.current);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Leaving this page discards your progress here. Leave anyway?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    if (!hasWork) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasWork]);

  return {
    allowNavigation: () => {
      allowedRef.current = true;
    },
  };
}
