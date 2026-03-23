import { useEffect, useRef, useState } from "react";

import { AnalysisPanel } from "./analysis/AnalysisPanel";
import {
  AnnotationLayer,
  createInitialAnnotationLayerState,
} from "./annotation/AnnotationLayer";
import {
  createSceneDisplaySettings,
  type SceneDisplaySettings,
} from "./io/sceneFile";
import { ShellLayout } from "./layout/ShellLayout";
import { BottomTransportBar } from "./panels/BottomTransportBar";
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
import {
  createMockRuntimeBridgePort,
  type RuntimeBridgePortSnapshot,
  type RuntimeTrajectorySample,
} from "./state/runtimeBridge";
import { createDesktopRuntimeBridgePort } from "./state/desktopRuntimeBridgePort";
import { createRuntimeCompileRequestFromEditorState } from "./state/runtimeCompileRequest";
import { useEditorHotkeys } from "./state/useEditorHotkeys";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import type { EditorTool } from "./workspace/tools";

const GRAVITY_ACCELERATION = 9.8;
const PRIMARY_ANALYZER_ID = "traj-primary";

function getEntityCenter(entity: EditorSceneEntity) {
  if (entity.kind === "ball") {
    return {
      x: entity.x + entity.radius,
      y: entity.y + entity.radius,
    };
  }

  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

function createRuntimePreviewFrame(
  entities: EditorSceneEntity[],
  input: RuntimeBridgePortSnapshot & { nextFrameNumber: number },
) {
  const elapsedTimeSeconds = input.bridge.currentTimeSeconds;

  return {
    frameNumber: input.nextFrameNumber,
    entities: entities.map((entity) => {
      const center = getEntityCenter(entity);
      const timeAdjustedPosition = entity.locked
        ? center
        : {
            x: center.x + entity.velocityX * elapsedTimeSeconds,
            y:
              center.y +
              entity.velocityY * elapsedTimeSeconds +
              0.5 * GRAVITY_ACCELERATION * elapsedTimeSeconds * elapsedTimeSeconds,
          };

      return {
        entityId: entity.id,
        position: timeAdjustedPosition,
        rotation: 0,
        velocity: entity.locked
          ? { x: 0, y: 0 }
          : {
              x: entity.velocityX,
              y: entity.velocityY + GRAVITY_ACCELERATION * elapsedTimeSeconds,
            },
        acceleration: entity.locked ? { x: 0, y: 0 } : { x: 0, y: GRAVITY_ACCELERATION },
      };
    }),
  };
}

function createRuntimePreviewTrajectorySamples(input: {
  bridge: RuntimeBridgePortSnapshot["bridge"];
  currentSamplesByAnalyzer: Record<string, RuntimeTrajectorySample[]>;
}) {
  const trackedEntity = input.bridge.currentFrame?.entities[0];

  if (!trackedEntity) {
    return input.currentSamplesByAnalyzer;
  }

  return {
    [PRIMARY_ANALYZER_ID]: [
      ...(input.currentSamplesByAnalyzer[PRIMARY_ANALYZER_ID] ?? []),
      {
        frameNumber: input.bridge.currentFrame?.frameNumber ?? 0,
        timeSeconds: input.bridge.currentTimeSeconds,
        position: {
          x: trackedEntity.transform.x,
          y: trackedEntity.transform.y,
        },
        velocity: trackedEntity.velocity ?? { x: 0, y: 0 },
        acceleration: trackedEntity.acceleration ?? { x: 0, y: 0 },
      },
    ],
  };
}

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [entities, setEntities] = useState<EditorSceneEntity[]>(createInitialSceneEntities);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryBodyKind>("ball");
  const [annotationState, setAnnotationState] = useState(createInitialAnnotationLayerState);
  const [displaySettings, setDisplaySettings] = useState(() =>
    createSceneDisplaySettings({
      gridVisible: true,
      showLabels: true,
      showTrajectories: false,
    }),
  );
  const entityCatalogRef = useRef(entities);
  const [runtimePort] = useState(() =>
    createDesktopRuntimeBridgePort({
      fallbackPort: createMockRuntimeBridgePort({
        createFrame: (input) => createRuntimePreviewFrame(entityCatalogRef.current, input),
        createTrajectorySamples: ({ bridge, currentSamplesByAnalyzer }) =>
          createRuntimePreviewTrajectorySamples({
            bridge,
            currentSamplesByAnalyzer,
          }),
      }),
    }),
  );
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(() => runtimePort.getSnapshot());

  useEffect(() => {
    entityCatalogRef.current = entities;
  }, [entities]);

  useEffect(() => runtimePort.subscribe(setRuntimeSnapshot), [runtimePort]);

  useEffect(() => {
    void runtimePort.compile(
      createRuntimeCompileRequestFromEditorState({
        analyzerId: PRIMARY_ANALYZER_ID,
        annotations: annotationState.strokes,
        entities,
      }),
    );
  }, [annotationState.strokes, entities, runtimePort]);

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
    setDisplaySettings((current) =>
      createSceneDisplaySettings({
        ...current,
        gridVisible: visible,
      }),
    );
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

  function handleUpdateDisplaySetting(display: Partial<SceneDisplaySettings>) {
    setDisplaySettings((current) =>
      createSceneDisplaySettings({
        ...current,
        ...display,
      }),
    );

    const nextGridVisible = display.gridVisible;

    if (nextGridVisible !== undefined) {
      setEditorState((current) => ({
        ...current,
        gridVisible: nextGridVisible,
      }));
    }
  }

  return (
    <ShellLayout
      bottomPane={
        <div style={{ display: "grid", gap: "14px" }}>
          <BottomTransportBar
            runtime={runtimeSnapshot.bridge}
            onPause={() => {
              void runtimePort.pause();
            }}
            onReset={() => {
              void runtimePort.reset();
            }}
            onStart={() => {
              void runtimePort.start();
            }}
            onStep={() => {
              void runtimePort.step();
            }}
            onTimeScaleChange={(timeScale) => {
              void runtimePort.setTimeScale(timeScale);
            }}
          />
          <AnalysisPanel
            analyzerId={PRIMARY_ANALYZER_ID}
            display={{
              showTrajectories: displaySettings.showTrajectories,
              showVelocityVectors: displaySettings.showVelocityVectors,
              showForceVectors: displaySettings.showForceVectors,
            }}
            onDisplayChange={(nextDisplay) => {
              handleUpdateDisplaySetting(nextDisplay);
            }}
            runtimePort={runtimePort}
          />
        </div>
      }
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
            onUpdateDisplaySetting={handleUpdateDisplaySetting}
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
      <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: "14px" }}>
        <WorkspaceCanvas
          display={displaySettings}
          entities={entities}
          onCreateEntity={handleCreateEntity}
          onGridVisibleChange={handleGridVisibleChange}
          onMoveEntity={handleMoveEntity}
          onSelectEntity={handleSelectEntity}
          onToolChange={handleToolChange}
          state={editorState}
        />
        <AnnotationLayer state={annotationState} onStateChange={setAnnotationState} />
      </div>
    </ShellLayout>
  );
}
