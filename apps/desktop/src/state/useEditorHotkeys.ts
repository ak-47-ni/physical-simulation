import { useEffect } from "react";

type UseEditorHotkeysOptions = {
  onDeleteSelectedEntity: () => void;
  onDuplicateSelectedEntity: () => void;
  selectedEntityId: string | null;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "SELECT" ||
    tagName === "TEXTAREA"
  );
}

function resolveHotkeyTarget(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target;
  }

  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function useEditorHotkeys(options: UseEditorHotkeysOptions) {
  const { onDeleteSelectedEntity, onDuplicateSelectedEntity, selectedEntityId } = options;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const activeTarget = resolveHotkeyTarget(event.target);

      if (!selectedEntityId || isTypingTarget(activeTarget)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        onDuplicateSelectedEntity();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onDeleteSelectedEntity();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDeleteSelectedEntity, onDuplicateSelectedEntity, selectedEntityId]);
}
