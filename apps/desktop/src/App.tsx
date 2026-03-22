import { useState } from "react";

import { ShellLayout } from "./layout/ShellLayout";
import { createInitialEditorState, type EditorSceneEntity } from "./state/editorStore";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import type { EditorTool } from "./workspace/tools";

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const sampleEntities: EditorSceneEntity[] = [
    { id: "ball-1", label: "Ball 1", x: 132, y: 176 },
    { id: "board-1", label: "Board 1", x: 318, y: 272 },
  ];

  function handleToolChange(tool: EditorTool) {
    setEditorState((current) => ({
      ...current,
      activeTool: tool,
    }));
  }

  function handleGridVisibleChange(visible: boolean) {
    setEditorState((current) => ({
      ...current,
      gridVisible: visible,
    }));
  }

  return (
    <ShellLayout
      bottomPane={<span>Transport controls mount point</span>}
      leftPane={<span>Object library mount point</span>}
      rightPane={<span>Property and scene tree mount point</span>}
    >
      <WorkspaceCanvas
        entities={sampleEntities}
        onGridVisibleChange={handleGridVisibleChange}
        onToolChange={handleToolChange}
        state={editorState}
      />
    </ShellLayout>
  );
}
