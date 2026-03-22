import { useState } from "react";

import { createSceneDisplaySettings } from "./io/sceneFile";
import { ShellLayout } from "./layout/ShellLayout";
import { ObjectLibraryPanel } from "./panels/ObjectLibraryPanel";
import { PropertyPanel } from "./panels/PropertyPanel";
import { SceneTreePanel } from "./panels/SceneTreePanel";
import { createInitialEditorState, type EditorSceneEntity } from "./state/editorStore";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import type { EditorTool } from "./workspace/tools";

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [displaySettings] = useState(() =>
    createSceneDisplaySettings({
      gridVisible: true,
      showLabels: true,
      showTrajectories: false,
    }),
  );
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

  function handleSelectEntity(entityId: string) {
    setEditorState((current) => ({
      ...current,
      selectedEntityId: entityId,
    }));
  }

  const selectedEntity =
    sampleEntities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;

  return (
    <ShellLayout
      bottomPane={<span>Transport controls mount point</span>}
      leftPane={<ObjectLibraryPanel />}
      rightPane={
        <div style={{ display: "grid", gap: "16px" }}>
          <PropertyPanel display={displaySettings} selectedEntity={selectedEntity} />
          <SceneTreePanel
            entities={sampleEntities}
            onSelect={handleSelectEntity}
            selectedEntityId={editorState.selectedEntityId}
          />
        </div>
      }
    >
      <WorkspaceCanvas
        entities={sampleEntities}
        onGridVisibleChange={handleGridVisibleChange}
        onSelectEntity={handleSelectEntity}
        onToolChange={handleToolChange}
        state={editorState}
      />
    </ShellLayout>
  );
}
