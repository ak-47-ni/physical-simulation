import { useState } from "react";

import { createSceneDisplaySettings } from "./io/sceneFile";
import { ShellLayout } from "./layout/ShellLayout";
import { ObjectLibraryPanel } from "./panels/ObjectLibraryPanel";
import { PropertyPanel } from "./panels/PropertyPanel";
import { SceneTreePanel } from "./panels/SceneTreePanel";
import {
  createDuplicatedEntity,
  createPlacedBodyEntity,
  createInitialEditorState,
  createInitialSceneEntities,
  type EditorEntityPhysics,
  type EditorSceneEntity,
  type LibraryBodyKind,
} from "./state/editorStore";
import { useEditorHotkeys } from "./state/useEditorHotkeys";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import type { EditorTool } from "./workspace/tools";

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [entities, setEntities] = useState<EditorSceneEntity[]>(createInitialSceneEntities);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryBodyKind>("ball");
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

  function updateSelectedEntity(
    updater: (entity: EditorSceneEntity) => EditorSceneEntity,
  ) {
    if (!editorState.selectedEntityId) {
      return;
    }

    setEntities((current) =>
      current.map((entity) =>
        entity.id === editorState.selectedEntityId ? updater(entity) : entity,
      ),
    );
  }

  function handleUpdateSelectedEntityPosition(position: { x: number; y: number }) {
    if (!editorState.selectedEntityId) {
      return;
    }

    handleMoveEntity(editorState.selectedEntityId, position);
  }

  function handleCreateEntity(position: { x: number; y: number }) {
    setEntities((current) => {
      const nextEntity = createPlacedBodyEntity(current, selectedLibraryItem, position);
      handleSelectEntity(nextEntity.id);
      return [...current, nextEntity];
    });
  }

  function handleSelectLibraryItem(itemId: LibraryBodyKind) {
    setSelectedLibraryItem(itemId);
    handleToolChange("place-body");
  }

  function handleDeleteSelectedEntity() {
    if (!editorState.selectedEntityId) {
      return;
    }

    setEntities((current) =>
      current.filter((entity) => entity.id !== editorState.selectedEntityId),
    );
    setEditorState((current) => ({
      ...current,
      selectedEntityId: null,
    }));
  }

  const selectedEntity = entities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;

  function handleDuplicateSelectedEntity() {
    if (!selectedEntity) {
      return;
    }

    const nextEntity = createDuplicatedEntity(entities, selectedEntity);

    setEntities((current) => [...current, nextEntity]);
    handleSelectEntity(nextEntity.id);
  }

  useEditorHotkeys({
    onDeleteSelectedEntity: handleDeleteSelectedEntity,
    onDuplicateSelectedEntity: handleDuplicateSelectedEntity,
    selectedEntityId: editorState.selectedEntityId,
  });

  function handleUpdateSelectedEntityLabel(label: string) {
    updateSelectedEntity((entity) => ({
      ...entity,
      label,
    }));
  }

  function handleUpdateSelectedEntityRadius(radius: number) {
    updateSelectedEntity((entity) => {
      if (entity.kind !== "ball") {
        return entity;
      }

      return {
        ...entity,
        radius,
      };
    });
  }

  function handleUpdateSelectedEntitySize(size: { width: number; height: number }) {
    updateSelectedEntity((entity) => {
      if (entity.kind === "ball") {
        return entity;
      }

      return {
        ...entity,
        width: size.width,
        height: size.height,
      };
    });
  }

  function handleUpdateSelectedEntityPhysics(physics: Partial<EditorEntityPhysics>) {
    updateSelectedEntity((entity) => ({
      ...entity,
      ...physics,
    }));
  }

  return (
    <ShellLayout
      bottomPane={<span>Transport controls mount point</span>}
      leftPane={
        <ObjectLibraryPanel
          onSelectItem={handleSelectLibraryItem}
          selectedItemId={selectedLibraryItem}
        />
      }
      rightPane={
        <div style={{ display: "grid", gap: "16px" }}>
          <PropertyPanel
            display={displaySettings}
            onDeleteSelectedEntity={handleDeleteSelectedEntity}
            onDuplicateSelectedEntity={handleDuplicateSelectedEntity}
            onUpdateSelectedEntityLabel={handleUpdateSelectedEntityLabel}
            onUpdateSelectedEntityPosition={handleUpdateSelectedEntityPosition}
            onUpdateSelectedEntityPhysics={handleUpdateSelectedEntityPhysics}
            onUpdateSelectedEntityRadius={handleUpdateSelectedEntityRadius}
            onUpdateSelectedEntitySize={handleUpdateSelectedEntitySize}
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
