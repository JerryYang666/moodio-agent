"use client";

import { useEffect } from "react";
import type { OperationHistoryAPI } from "./use-operation-history";

/**
 * Return true if the event target is a text-editing surface where the
 * browser's native undo/redo should take precedence. Overriding Ctrl+Z
 * inside an `<input>` or contenteditable would break mid-edit UX.
 */
function isEditingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"], [contenteditable=""]')) return true;
  return false;
}

interface Options {
  history: OperationHistoryAPI;
  /**
   * Optional guard — return true to skip handling. Useful when the surface
   * knows the local user is in a mode that shouldn't respond to global undo
   * (e.g. they hold a cell edit lock).
   */
  disabled?: () => boolean;
}

/**
 * Attach a window-level keyboard listener for Ctrl/Cmd+Z (undo) and
 * Ctrl/Cmd+Shift+Z or Ctrl+Y (redo). Safe to mount once per surface; the
 * listener is removed on unmount.
 *
 * Native text editing is preserved: events dispatched from inputs,
 * textareas, or contenteditable descendants are ignored.
 */
export function useUndoRedoKeyboard({ history, disabled }: Options): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;

      if (disabled?.()) return;
      if (isEditingContext(e.target)) return;

      e.preventDefault();
      if (isUndo) {
        void history.undo();
      } else {
        void history.redo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [history, disabled]);
}
