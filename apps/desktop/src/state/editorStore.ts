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
};

export function createInitialEditorState(): EditorState {
  return {
    activeTool: "select",
    gridVisible: true,
  };
}
