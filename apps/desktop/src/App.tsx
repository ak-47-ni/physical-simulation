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
  createSpringConstraintFromEntities,
  createTrackConstraintFromEntityAndPoint,
  type EditorConstraint,
  type LibraryConstraintKind,
} from "./state/editorConstraints";
import {
  createDuplicatedEntity,
  createPlacedBodyEntity,
  createInitialEditorState,
  createInitialSceneEntities,
  type EditorEntityPhysics,
  type EditorSceneEntity,
  type LibraryItemKind,
  isLibraryBodyKind,
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
import { projectRuntimeSceneEntities } from "./workspace/runtimeSceneView";
import type { EditorTool } from "./workspace/tools";

const GRAVITY_ACCELERATION = 9.8;
const PRIMARY_ANALYZER_ID = "traj-primary";

type ConstraintPlacementState = {
  anchorEntityId: string | null;
  hint: string;
  kind: LibraryConstraintKind;
  mode: "pick-entity" | "pick-point";
};

type ConstraintUpdate = {
  axis?: { x: number; y: number };
  origin?: { x: number; y: number };
  restLength?: number;
  stiffness?: number;
};

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
  const [constraints, setConstraints] = useState<EditorConstraint[]>([]);
  const [entities, setEntities] = useState<EditorSceneEntity[]>(createInitialSceneEntities);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<LibraryItemKind>("ball");
  const [constraintPlacement, setConstraintPlacement] = useState<ConstraintPlacementState | null>(null);
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
        constraints,
        entities,
      }),
    );
  }, [annotationState.strokes, constraints, entities, runtimePort]);

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
    if (constraintPlacement?.mode === "pick-entity") {
      handleConstraintEntityPick(entityId);
      return;
    }

    setEditorState((current) => ({
      ...current,
      selectedConstraintId: null,
      selectedEntityId: entityId,
    }));
  }

  function handleSelectConstraint(constraintId: string) {
    setEditorState((current) => ({
      ...current,
      selectedConstraintId: constraintId,
      selectedEntityId: null,
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
    if (!isLibraryBodyKind(selectedLibraryItem)) {
      return;
    }

    setEntities((current) => {
      const nextEntity = createPlacedBodyEntity(current, selectedLibraryItem, position);
      handleSelectEntity(nextEntity.id);
      return [...current, nextEntity];
    });
  }

  function handleSelectLibraryItem(itemId: LibraryItemKind) {
    setSelectedLibraryItem(itemId);

    if (isLibraryBodyKind(itemId)) {
      setConstraintPlacement(null);
      handleToolChange("place-body");
      return;
    }

    handleToolChange("place-constraint");
    setConstraintPlacement(
      itemId === "spring"
        ? {
            anchorEntityId: null,
            hint: "Select first body for the spring",
            kind: "spring",
            mode: "pick-entity",
          }
        : {
            anchorEntityId: null,
            hint: "Select a body for the track",
            kind: "track",
            mode: "pick-entity",
          },
    );
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
      selectedConstraintId: null,
      selectedEntityId: null,
    }));
  }

  const selectedEntity = entities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;
  const selectedConstraint =
    constraints.find((constraint) => constraint.id === editorState.selectedConstraintId) ?? null;
  const displayEntities = projectRuntimeSceneEntities({
    editorEntities: entities,
    runtimeFrame: runtimeSnapshot.bridge.currentFrame,
  });

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

  function handleUpdateSelectedConstraint(update: ConstraintUpdate) {
    if (!editorState.selectedConstraintId) {
      return;
    }

    setConstraints((current) =>
      current.map((constraint) => {
        if (constraint.id !== editorState.selectedConstraintId) {
          return constraint;
        }

        if (constraint.kind === "spring") {
          return {
            ...constraint,
            restLength: update.restLength ?? constraint.restLength,
            stiffness: update.stiffness ?? constraint.stiffness,
          };
        }

        return {
          ...constraint,
          axis: update.axis ?? constraint.axis,
          origin: update.origin ?? constraint.origin,
        };
      }),
    );
  }

  function handleDeleteSelectedConstraint() {
    if (!editorState.selectedConstraintId) {
      return;
    }

    setConstraints((current) =>
      current.filter((constraint) => constraint.id !== editorState.selectedConstraintId),
    );
    setEditorState((current) => ({
      ...current,
      selectedConstraintId: null,
    }));
  }

  function getEntityCenterForConstraint(entityId: string) {
    const entity = entities.find((candidate) => candidate.id === entityId);

    return entity ? getEntityCenter(entity) : null;
  }

  function finishConstraintPlacement() {
    setConstraintPlacement(null);
    handleToolChange("select");
  }

  function handleCancelConstraintPlacement() {
    finishConstraintPlacement();
  }

  function handleConstraintEntityPick(entityId: string) {
    if (!constraintPlacement) {
      return;
    }

    if (constraintPlacement.kind === "spring") {
      if (!constraintPlacement.anchorEntityId) {
        setConstraintPlacement({
          ...constraintPlacement,
          anchorEntityId: entityId,
          hint: "Select second body for the spring",
        });
        return;
      }

      if (constraintPlacement.anchorEntityId === entityId) {
        return;
      }

      const anchorEntityId = constraintPlacement.anchorEntityId;
      const entityA = getEntityCenterForConstraint(anchorEntityId);
      const entityB = getEntityCenterForConstraint(entityId);

      if (!entityA || !entityB) {
        return;
      }

      setConstraints((current) => [
        ...current,
        createSpringConstraintFromEntities(current, [
          {
            id: anchorEntityId,
            ...entityA,
          },
          {
            id: entityId,
            ...entityB,
          },
        ]),
      ]);
      finishConstraintPlacement();
      return;
    }

    setConstraintPlacement({
      ...constraintPlacement,
      anchorEntityId: entityId,
      hint: "Pick a point to define the track axis",
      mode: "pick-point",
    });
  }

  function handleConstraintPointPick(position: { x: number; y: number }) {
    if (!constraintPlacement || constraintPlacement.kind !== "track" || !constraintPlacement.anchorEntityId) {
      return;
    }

    const anchorEntityId = constraintPlacement.anchorEntityId;
    const origin = getEntityCenterForConstraint(anchorEntityId);

    if (!origin) {
      return;
    }

    setConstraints((current) => [
      ...current,
      createTrackConstraintFromEntityAndPoint(
        current,
        {
          id: anchorEntityId,
          ...origin,
        },
        position,
      ),
    ]);
    finishConstraintPlacement();
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
            onDeleteSelectedConstraint={handleDeleteSelectedConstraint}
            onDeleteSelectedEntity={handleDeleteSelectedEntity}
            onDuplicateSelectedEntity={handleDuplicateSelectedEntity}
            onUpdateDisplaySetting={handleUpdateDisplaySetting}
            onUpdateSelectedConstraint={handleUpdateSelectedConstraint}
            onUpdateSelectedEntityLabel={handleUpdateSelectedEntityLabel}
            onUpdateSelectedEntityPosition={handleUpdateSelectedEntityPosition}
            onUpdateSelectedEntityPhysics={handleUpdateSelectedEntityPhysics}
            onUpdateSelectedEntityRadius={handleUpdateSelectedEntityRadius}
            onUpdateSelectedEntitySize={handleUpdateSelectedEntitySize}
            selectedConstraint={selectedConstraint}
            selectedEntity={selectedEntity}
          />
          <SceneTreePanel
            constraints={constraints}
            entities={entities}
            onSelectConstraint={handleSelectConstraint}
            onSelectEntity={handleSelectEntity}
            selectedConstraintId={editorState.selectedConstraintId}
            selectedEntityId={editorState.selectedEntityId}
          />
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: "14px" }}>
        <WorkspaceCanvas
          constraintPlacement={constraintPlacement}
          constraints={constraints}
          display={displaySettings}
          displayEntities={displayEntities}
          entities={entities}
          onCancelPlacement={handleCancelConstraintPlacement}
          onCreateEntity={handleCreateEntity}
          onGridVisibleChange={handleGridVisibleChange}
          onMoveEntity={handleMoveEntity}
          onPlaceConstraintEntity={handleConstraintEntityPick}
          onPlaceConstraintPoint={handleConstraintPointPick}
          onSelectEntity={handleSelectEntity}
          onToolChange={handleToolChange}
          state={editorState}
        />
        <AnnotationLayer state={annotationState} onStateChange={setAnnotationState} />
      </div>
    </ShellLayout>
  );
}
