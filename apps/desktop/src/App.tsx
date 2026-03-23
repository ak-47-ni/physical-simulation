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
import { convertSceneAuthoringUnits } from "./state/editorSceneDocument";
import { createRuntimeCompileRequestFromEditorState } from "./state/runtimeCompileRequest";
import {
  createSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "./state/sceneAuthoringSettings";
import {
  convertLengthValue,
  convertMassValue,
  getGravityUnitLabel,
  normalizeGravityToSi,
  normalizeVelocityToSi,
  type LengthUnit,
  type MassUnit,
  type VelocityUnit,
} from "./state/sceneUnits";
import { useEditorHotkeys } from "./state/useEditorHotkeys";
import { useRuntimePlaybackLoop } from "./state/useRuntimePlaybackLoop";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import { projectRuntimeSceneEntities } from "./workspace/runtimeSceneView";
import {
  projectAuthoringPointToSi,
  type UnitViewport,
} from "./workspace/unitViewport";
import type { EditorTool } from "./workspace/tools";

const PRIMARY_ANALYZER_ID = "traj-primary";
const AUTHORING_LOCK_REASON = "Authoring is locked while runtime is playing.";
const SCENE_PHYSICS_LOCK_REASON = "Scene physics is locked while runtime is playing.";
const LENGTH_UNIT_OPTIONS = ["m", "cm"] as const satisfies readonly LengthUnit[];
const VELOCITY_UNIT_OPTIONS = ["m/s", "cm/s"] as const satisfies readonly VelocityUnit[];
const MASS_UNIT_OPTIONS = ["kg", "g"] as const satisfies readonly MassUnit[];
const INITIAL_SCENE_SETTINGS = createSceneAuthoringSettings({
  gravity: 9.8,
  lengthUnit: "m",
  velocityUnit: "m/s",
  massUnit: "kg",
  pixelsPerMeter: 100,
});
const LEGACY_SCENE_SETTINGS = createSceneAuthoringSettings({
  gravity: 980,
  lengthUnit: "cm",
  velocityUnit: "cm/s",
  massUnit: "kg",
  pixelsPerMeter: 100,
});

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
  settings: SceneAuthoringSettings,
  viewport: UnitViewport,
  input: RuntimeBridgePortSnapshot & { nextFrameNumber: number },
) {
  const elapsedTimeSeconds = input.bridge.currentTimeSeconds;
  const gravityAccelerationSi = normalizeGravityToSi(settings.gravity, settings.lengthUnit);

  return {
    frameNumber: input.nextFrameNumber,
    entities: entities.map((entity) => {
      const centerSi = projectAuthoringPointToSi(getEntityCenter(entity), viewport);
      const velocityXSi = normalizeVelocityToSi(entity.velocityX, settings.velocityUnit);
      const velocityYSi = normalizeVelocityToSi(entity.velocityY, settings.velocityUnit);
      const timeAdjustedPosition = entity.locked
        ? centerSi
        : {
            x: centerSi.x + velocityXSi * elapsedTimeSeconds,
            y:
              centerSi.y +
              velocityYSi * elapsedTimeSeconds +
              0.5 * gravityAccelerationSi * elapsedTimeSeconds * elapsedTimeSeconds,
          };

      return {
        entityId: entity.id,
        position: timeAdjustedPosition,
        rotation: 0,
        velocity: entity.locked
          ? { x: 0, y: 0 }
          : {
              x: velocityXSi,
              y: velocityYSi + gravityAccelerationSi * elapsedTimeSeconds,
            },
        acceleration: entity.locked ? { x: 0, y: 0 } : { x: 0, y: gravityAccelerationSi },
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

function isLengthUnit(value: string): value is LengthUnit {
  return LENGTH_UNIT_OPTIONS.includes(value as LengthUnit);
}

function isVelocityUnit(value: string): value is VelocityUnit {
  return VELOCITY_UNIT_OPTIONS.includes(value as VelocityUnit);
}

function isMassUnit(value: string): value is MassUnit {
  return MASS_UNIT_OPTIONS.includes(value as MassUnit);
}

function createInitialAuthoringState() {
  const converted = convertSceneAuthoringUnits({
    constraints: [],
    entities: createInitialSceneEntities(),
    settings: LEGACY_SCENE_SETTINGS,
    units: {
      lengthUnit: INITIAL_SCENE_SETTINGS.lengthUnit,
      velocityUnit: INITIAL_SCENE_SETTINGS.velocityUnit,
      massUnit: INITIAL_SCENE_SETTINGS.massUnit,
    },
  });

  return {
    constraints: converted.constraints,
    entities: converted.entities,
    settings: createSceneAuthoringSettings({
      ...converted.settings,
      pixelsPerMeter: INITIAL_SCENE_SETTINGS.pixelsPerMeter,
    }),
  };
}

function createWorkspaceViewport(settings: SceneAuthoringSettings): UnitViewport {
  return {
    lengthUnit: settings.lengthUnit,
    pixelsPerMeter: settings.pixelsPerMeter,
  };
}

function createScenePhysicsPanelState(
  settings: SceneAuthoringSettings,
  authoringLocked: boolean,
) {
  return {
    gravity: settings.gravity,
    gravityUnitLabel: getGravityUnitLabel(settings.lengthUnit),
    lengthUnit: settings.lengthUnit,
    lengthUnitOptions: [...LENGTH_UNIT_OPTIONS],
    lockReason: authoringLocked ? SCENE_PHYSICS_LOCK_REASON : null,
    massUnit: settings.massUnit,
    massUnitOptions: [...MASS_UNIT_OPTIONS],
    pixelsPerMeter: settings.pixelsPerMeter,
    velocityUnit: settings.velocityUnit,
    velocityUnitOptions: [...VELOCITY_UNIT_OPTIONS],
  };
}

function roundAuthoringValue(value: number): number {
  return Number(value.toFixed(6));
}

function convertLegacyCreatedEntityToSceneUnits(
  entity: EditorSceneEntity,
  settings: SceneAuthoringSettings,
  position: { x: number; y: number },
): EditorSceneEntity {
  const mass = convertMassValue(entity.mass, LEGACY_SCENE_SETTINGS.massUnit, settings.massUnit);

  if (entity.kind === "ball") {
    return {
      ...entity,
      x: position.x,
      y: position.y,
      mass,
      radius: convertLengthValue(entity.radius, LEGACY_SCENE_SETTINGS.lengthUnit, settings.lengthUnit),
    };
  }

  return {
    ...entity,
    x: position.x,
    y: position.y,
    mass,
    width: convertLengthValue(entity.width, LEGACY_SCENE_SETTINGS.lengthUnit, settings.lengthUnit),
    height: convertLengthValue(entity.height, LEGACY_SCENE_SETTINGS.lengthUnit, settings.lengthUnit),
  };
}

function applySceneDuplicateOffset(
  entity: EditorSceneEntity,
  settings: SceneAuthoringSettings,
): EditorSceneEntity {
  const offset = convertLengthValue(24, LEGACY_SCENE_SETTINGS.lengthUnit, settings.lengthUnit);

  return {
    ...entity,
    x: roundAuthoringValue(entity.x - 24 + offset),
    y: roundAuthoringValue(entity.y - 24 + offset),
  };
}

export function App() {
  const initialAuthoringState = createInitialAuthoringState();
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [constraints, setConstraints] = useState<EditorConstraint[]>(initialAuthoringState.constraints);
  const [entities, setEntities] = useState<EditorSceneEntity[]>(initialAuthoringState.entities);
  const [sceneSettings, setSceneSettings] = useState<SceneAuthoringSettings>(initialAuthoringState.settings);
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
  const sceneSettingsRef = useRef(sceneSettings);
  const workspaceViewport = createWorkspaceViewport(sceneSettings);
  const [runtimePort] = useState(() =>
    createDesktopRuntimeBridgePort({
      fallbackPort: createMockRuntimeBridgePort({
        createFrame: (input) =>
          createRuntimePreviewFrame(
            entityCatalogRef.current,
            sceneSettingsRef.current,
            createWorkspaceViewport(sceneSettingsRef.current),
            input,
          ),
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

  useEffect(() => {
    sceneSettingsRef.current = sceneSettings;
  }, [sceneSettings]);

  useEffect(() => runtimePort.subscribe(setRuntimeSnapshot), [runtimePort]);

  useRuntimePlaybackLoop({
    runtimePort,
    snapshot: runtimeSnapshot,
  });

  useEffect(() => {
    void runtimePort.compile(
      createRuntimeCompileRequestFromEditorState({
        analyzerId: PRIMARY_ANALYZER_ID,
        annotations: annotationState.strokes,
        constraints,
        entities,
        settings: sceneSettings,
      }),
    );
  }, [annotationState.strokes, constraints, entities, runtimePort, sceneSettings]);

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
      const nextEntity = convertLegacyCreatedEntityToSceneUnits(
        createPlacedBodyEntity(current, selectedLibraryItem, position),
        sceneSettings,
        position,
      );
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
    viewport: workspaceViewport,
  });
  const authoringLocked = runtimeSnapshot.bridge.status === "running";
  const scenePhysicsState = createScenePhysicsPanelState(sceneSettings, authoringLocked);

  function handleDuplicateSelectedEntity() {
    if (!selectedEntity) {
      return;
    }

    const nextEntity = applySceneDuplicateOffset(
      createDuplicatedEntity(entities, selectedEntity),
      sceneSettings,
    );

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

  function handleScenePhysicsChange(update: {
    gravity?: number;
    lengthUnit?: string;
    massUnit?: string;
    pixelsPerMeter?: number;
    velocityUnit?: string;
  }) {
    if (authoringLocked) {
      return;
    }

    const nextLengthUnit = update.lengthUnit;
    const nextVelocityUnit = update.velocityUnit;
    const nextMassUnit = update.massUnit;
    const shouldConvertUnits =
      (nextLengthUnit !== undefined && isLengthUnit(nextLengthUnit) && nextLengthUnit !== sceneSettings.lengthUnit) ||
      (nextVelocityUnit !== undefined &&
        isVelocityUnit(nextVelocityUnit) &&
        nextVelocityUnit !== sceneSettings.velocityUnit) ||
      (nextMassUnit !== undefined && isMassUnit(nextMassUnit) && nextMassUnit !== sceneSettings.massUnit);

    if (shouldConvertUnits) {
      const converted = convertSceneAuthoringUnits({
        constraints,
        entities,
        settings: sceneSettings,
        units: {
          lengthUnit: isLengthUnit(nextLengthUnit ?? "") ? nextLengthUnit : undefined,
          velocityUnit: isVelocityUnit(nextVelocityUnit ?? "") ? nextVelocityUnit : undefined,
          massUnit: isMassUnit(nextMassUnit ?? "") ? nextMassUnit : undefined,
        },
      });

      setConstraints(converted.constraints);
      setEntities(converted.entities);
      setSceneSettings(
        createSceneAuthoringSettings({
          ...converted.settings,
          gravity: update.gravity ?? converted.settings.gravity,
          pixelsPerMeter: update.pixelsPerMeter ?? converted.settings.pixelsPerMeter,
        }),
      );
      return;
    }

    setSceneSettings((current) =>
      createSceneAuthoringSettings({
        ...current,
        gravity: update.gravity ?? current.gravity,
        pixelsPerMeter: update.pixelsPerMeter ?? current.pixelsPerMeter,
      }),
    );
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
            authoringLocked={authoringLocked}
            authoringLockReason={AUTHORING_LOCK_REASON}
            display={displaySettings}
            onDeleteSelectedConstraint={handleDeleteSelectedConstraint}
            onDeleteSelectedEntity={handleDeleteSelectedEntity}
            onDuplicateSelectedEntity={handleDuplicateSelectedEntity}
            onScenePhysicsChange={handleScenePhysicsChange}
            onUpdateDisplaySetting={handleUpdateDisplaySetting}
            onUpdateSelectedConstraint={handleUpdateSelectedConstraint}
            onUpdateSelectedEntityLabel={handleUpdateSelectedEntityLabel}
            onUpdateSelectedEntityPosition={handleUpdateSelectedEntityPosition}
            onUpdateSelectedEntityPhysics={handleUpdateSelectedEntityPhysics}
            onUpdateSelectedEntityRadius={handleUpdateSelectedEntityRadius}
            onUpdateSelectedEntitySize={handleUpdateSelectedEntitySize}
            scenePhysics={scenePhysicsState}
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
          authoringLocked={authoringLocked}
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
          viewport={workspaceViewport}
        />
        <AnnotationLayer state={annotationState} onStateChange={setAnnotationState} />
      </div>
    </ShellLayout>
  );
}
