import { useEffect, useRef } from "react";

/** What a step reports about its unsaved work, for the studio's shared Save button. */
export interface StepSaveState {
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
}

export interface StepSaveHandle extends StepSaveState {
  save: () => Promise<void>;
}

/**
 * Wires a step into the studio's Save button (bottom bar, floating button,
 * Ctrl/⌘+S, save-before-switching-step). `onChange` must be stable (a state
 * setter); `save` may change every render — the latest one is always called.
 */
export function useStepSave(
  onChange: ((handle: StepSaveHandle | null) => void) | undefined,
  { dirty, saving, savedAt }: StepSaveState,
  save: () => Promise<void>,
): void {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const savedAtMs = savedAt?.getTime() ?? null;
  useEffect(() => {
    onChange?.({
      dirty,
      saving,
      savedAt: savedAtMs === null ? null : new Date(savedAtMs),
      save: () => saveRef.current(),
    });
  }, [onChange, dirty, saving, savedAtMs]);

  useEffect(() => () => onChange?.(null), [onChange]);
}
