import { useState } from "react";

import { createSceneDisplaySettings } from "./io/sceneFile";
import { ShellLayout } from "./layout/ShellLayout";
import { ObjectLibraryPanel } from "./panels/ObjectLibraryPanel";
import { PropertyPanel } from "./panels/PropertyPanel";
import { SceneTreePanel } from "./panels/SceneTreePanel";
import {
  createPlacedBallEntity,
  createInitialEditorState,
  createInitialSceneEntities,
  type EditorSceneEntity,
} from "./state/editorStore";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import type { EditorTool } from "./workspace/tools";

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [entities, setEntities] = useState<EditorSceneEntity[]>(createInitialSceneEntities);
  const [displaySettings] = useState(() =>
    createSceneDisplaySettings({
      gridVisible: true,
      showLabels: true,
      showTrajectories: false,
    }),
  );

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

  function handleMoveEntity(entityId: string, position: { x: number; y: number }) {
    setEntities((current) =>
      current.map((entity) =>
        entity.id === entityId ? { ...entity, x: position.x, y: position.y } : entity,
      ),
    );
    handleSelectEntity(entityId);
  }

  function handleUpdateSelectedEntityPosition(position: { x: number; y: number }) {
    if (!editorState.selectedEntityId) {
      return;
    }

    handleMoveEntity(editorState.selectedEntityId, position);
  }

  function handleCreateEntity(position: { x: number; y: number }) {
    setEntities((current) => {
      const nextEntity = createPlacedBallEntity(current, position);
      handleSelectEntity(nextEntity.id);
      return [...current, nextEntity];
    });
  }

  const selectedEntity = entities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;

  return (
    <ShellLayout
      bottomPane={<span>Transport controls mount point</span>}
      leftPane={<ObjectLibraryPanel />}
      rightPane={
        <div style={{ display: "grid", gap: "16px" }}>
          <PropertyPanel
            display={displaySettings}
            onUpdateSelectedEntityPosition={handleUpdateSelectedEntityPosition}
            selectedEntity={selectedEntity}
          />
          <SceneTreePanel
            entities={entities}
            onSelect={handleSelectEntity}
            selectedEntityId={editorState.selectedEntityId}
          />
        </div>
      }
    >
      <WorkspaceCanvas
        entities={entities}
        onCreateEntity={handleCreateEntity}
        onGridVisibleChange={handleGridVisibleChange}
        onMoveEntity={handleMoveEntity}
        onSelectEntity={handleSelectEntity}
        onToolChange={handleToolChange}
        state={editorState}
      />
    </ShellLayout>
  );
}
