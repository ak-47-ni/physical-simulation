import type { LibraryBodyKind } from "../state/editorStore";

export type LibraryDragSession = {
  bodyKind: LibraryBodyKind;
  pointerClientX: number;
  pointerClientY: number;
};
