import type { EditorTool } from "../workspace/tools";

export type EditorSceneEntity = {
  id: string;
  label: string;
  x: number;
  y: number;
};

export type EditorState = {
  activeTool: EditorTool;
  gridVisible: boolean;
  selectedEntityId: string | null;
};

export function createInitialEditorState(): EditorState {
  return {
    activeTool: "select",
    gridVisible: true,
    selectedEntityId: null,
  };
}

export function createInitialSceneEntities(): EditorSceneEntity[] {
  return [
    { id: "ball-1", label: "Ball 1", x: 132, y: 176 },
    { id: "board-1", label: "Board 1", x: 318, y: 272 },
  ];
}
