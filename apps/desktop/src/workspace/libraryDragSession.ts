import type { LibraryBodyKind } from "../state/editorStore";

export type LibraryDragSession = {
  bodyKind: LibraryBodyKind;
  pointerClientPx: {
    x: number;
    y: number;
  };
};
