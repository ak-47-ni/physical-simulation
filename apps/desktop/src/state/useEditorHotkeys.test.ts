import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEditorHotkeys } from "./useEditorHotkeys";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useEditorHotkeys", () => {
  it("duplicates the selected entity on ctrl or command d", () => {
    const onDeleteSelectedEntity = vi.fn();
    const onDuplicateSelectedEntity = vi.fn();

    renderHook(() =>
      useEditorHotkeys({
        onDeleteSelectedEntity,
        onDuplicateSelectedEntity,
        selectedEntityId: "board-1",
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "d",
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onDuplicateSelectedEntity).toHaveBeenCalledTimes(1);
    expect(onDeleteSelectedEntity).not.toHaveBeenCalled();
  });

  it("deletes the selected entity on delete or backspace", () => {
    const onDeleteSelectedEntity = vi.fn();
    const onDuplicateSelectedEntity = vi.fn();

    renderHook(() =>
      useEditorHotkeys({
        onDeleteSelectedEntity,
        onDuplicateSelectedEntity,
        selectedEntityId: "board-1",
      }),
    );

    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "Backspace" });

    expect(onDeleteSelectedEntity).toHaveBeenCalledTimes(2);
    expect(onDuplicateSelectedEntity).not.toHaveBeenCalled();
  });

  it("ignores shortcuts while typing in a form field", () => {
    const onDeleteSelectedEntity = vi.fn();
    const onDuplicateSelectedEntity = vi.fn();
    const input = document.createElement("input");

    document.body.append(input);
    input.focus();

    renderHook(() =>
      useEditorHotkeys({
        onDeleteSelectedEntity,
        onDuplicateSelectedEntity,
        selectedEntityId: "board-1",
      }),
    );

    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { ctrlKey: true, key: "d" });

    expect(onDeleteSelectedEntity).not.toHaveBeenCalled();
    expect(onDuplicateSelectedEntity).not.toHaveBeenCalled();
  });

  it("cancels the active interaction on escape even without a selected entity", () => {
    const onCancelInteraction = vi.fn();

    renderHook(() =>
      useEditorHotkeys({
        onCancelInteraction,
        onDeleteSelectedEntity: vi.fn(),
        onDuplicateSelectedEntity: vi.fn(),
        selectedEntityId: null,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onCancelInteraction).toHaveBeenCalledTimes(1);
  });

  it("does not cancel interactions while typing in a form field", () => {
    const onCancelInteraction = vi.fn();
    const input = document.createElement("input");

    document.body.append(input);
    input.focus();

    renderHook(() =>
      useEditorHotkeys({
        onCancelInteraction,
        onDeleteSelectedEntity: vi.fn(),
        onDuplicateSelectedEntity: vi.fn(),
        selectedEntityId: "board-1",
      }),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancelInteraction).not.toHaveBeenCalled();
  });
});
