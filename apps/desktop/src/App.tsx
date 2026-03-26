import { useEffect, useRef, useState, type ComponentProps, type ReactElement } from "react";

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
import { ObjectLibraryPanel } from "./panels/ObjectLibraryPanel";
import { PlaybackTransportDeck } from "./panels/PlaybackTransportDeck";
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
  type LibraryBodyKind,
  type LibraryItemKind,
  isLibraryBodyKind,
} from "./state/editorStore";
import {
  applySceneDuplicateOffset,
  canPlaceAuthoringCandidate,
  convertLegacyCreatedEntityToSceneUnits,
  findRepositionedAuthoringEntity,
  replaceEntityInCollection,
} from "./state/authoringPlacementGuards";
import {
  getDefaultAuthoringSnapDistance,
  resolveAuthoringPlacement,
  type AuthoringPlacementPreview,
} from "./state/authoringContactSnap";
import {
  createMockRuntimeBridgePort,
} from "./state/runtimeBridge";
import { createDesktopRuntimeBridgePort } from "./state/desktopRuntimeBridgePort";
import { convertSceneAuthoringUnits } from "./state/editorSceneDocument";
import { createRuntimeCompileRequestFromEditorState } from "./state/runtimeCompileRequest";
import {
  createRuntimePreviewFrame,
  createRuntimePreviewTrajectorySamples,
} from "./state/runtimePreview";
import { runtimeVelocityToAuthoring } from "./state/velocitySemantics";
import {
  createSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "./state/sceneAuthoringSettings";
import {
  getGravityUnitLabel,
  type LengthUnit,
  type MassUnit,
  type VelocityUnit,
} from "./state/sceneUnits";
import {
  useDualPlaybackController,
} from "./state/useDualPlaybackController";
import { useEditorHotkeys } from "./state/useEditorHotkeys";
import type { LibraryDragSession } from "./workspace/libraryDragSession";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import { projectRuntimeSceneEntities } from "./workspace/runtimeSceneView";
import {
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

type LibraryDragHoverState = {
  authoringPosition: { x: number; y: number } | null;
  isOverStage: boolean;
};

type DirectManipulationLibraryPanelProps = ComponentProps<typeof ObjectLibraryPanel> & {
  onStartBodyDrag?: (session: LibraryDragSession) => void;
};

type DirectManipulationWorkspaceCanvasProps = ComponentProps<typeof WorkspaceCanvas> & {
  authoringPlacementPreview?: AuthoringPlacementPreview;
  libraryDragBlocked?: boolean;
  libraryDragSession?: LibraryDragSession | null;
  onLibraryDragHoverChange?: (hover: LibraryDragHoverState | null) => void;
  onSelectConstraint?: (constraintId: string) => void;
  selectedRuntimeVelocityVector?: {
    entityId: string;
    velocityX: number;
    velocityY: number;
  } | null;
};

type PendingEntityDragPlacement = {
  entityId: string;
  position: { x: number; y: number };
};

const DirectManipulationObjectLibraryPanel = ObjectLibraryPanel as unknown as (
  props: DirectManipulationLibraryPanelProps,
) => ReactElement;

const DirectManipulationWorkspaceCanvas = WorkspaceCanvas as unknown as (
  props: DirectManipulationWorkspaceCanvasProps,
) => ReactElement;

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

function createAuthoringPlacementPreview(
  candidate: EditorSceneEntity,
  resolution: ReturnType<typeof resolveAuthoringPlacement>,
): AuthoringPlacementPreview {
  if (resolution.status === "blocked") {
    return {
      entity: candidate,
      status: "blocked",
    };
  }

  if (resolution.status === "snap") {
    return {
      entity: resolution.entity,
      status: "snap",
      contactWithEntityId: resolution.contactWithEntityId,
    };
  }

  return {
    entity: resolution.entity,
    status: "free",
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
  const [libraryDragHover, setLibraryDragHover] = useState<LibraryDragHoverState | null>(null);
  const [libraryDragSession, setLibraryDragSession] = useState<LibraryDragSession | null>(null);
  const [pendingEntityDragPlacement, setPendingEntityDragPlacement] =
    useState<PendingEntityDragPlacement | null>(null);
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
            analyzerId: PRIMARY_ANALYZER_ID,
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

  const {
    currentPlaybackTimeSeconds,
    handlePlaybackModeChange,
    handlePrecomputeDurationChange,
    handleTransportPause,
    handleTransportReset,
    handleTransportStart,
    handleTransportStep,
    handleTransportTimeScaleChange,
    isPreparing,
    playbackLocked,
    playbackMode,
    precomputeDurationSeconds,
    preparationProgress,
    realtimeCapSeconds,
    seekEnabled,
    seekPrecomputedPlayback,
    timelineMaxSeconds,
    transportRuntime,
    visibleRuntimeFrame,
  } = useDualPlaybackController({
    analyzerId: PRIMARY_ANALYZER_ID,
    annotationStrokes: annotationState.strokes,
    constraints,
    entities,
    runtimePort,
    runtimeSnapshot,
    sceneSettings,
  });

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

  function repositionEntityExactly(entityId: string, position: { x: number; y: number }) {
    const nextEntity = findRepositionedAuthoringEntity({
      entities,
      entityId,
      position,
    });

    if (!nextEntity) {
      return false;
    }

    setEntities((current) => replaceEntityInCollection(current, nextEntity));
    handleSelectEntity(entityId);

    return true;
  }

  function handleMoveEntity(entityId: string, position: { x: number; y: number }) {
    setPendingEntityDragPlacement({
      entityId,
      position,
    });
    repositionEntityExactly(entityId, position);
  }

  function createPlacedEntityCandidate(
    kind: LibraryBodyKind,
    position: { x: number; y: number },
  ) {
    return convertLegacyCreatedEntityToSceneUnits(
      createPlacedBodyEntity(entities, kind, position),
      sceneSettings,
      position,
    );
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

    setPendingEntityDragPlacement(null);
    repositionEntityExactly(editorState.selectedEntityId, position);
  }

  function handleCreateEntityFromKind(
    kind: LibraryBodyKind,
    position: { x: number; y: number },
  ) {
    const nextEntity = createPlacedEntityCandidate(kind, position);
    const resolution = resolveAuthoringPlacement({
      candidate: nextEntity,
      entities,
      maxSnapDistance: getDefaultAuthoringSnapDistance(sceneSettings.lengthUnit),
    });

    if (resolution.status === "blocked") {
      return;
    }

    setEntities((current) => [...current, resolution.entity]);
    handleSelectEntity(resolution.entity.id);
  }

  function handleCreateEntity(position: { x: number; y: number }) {
    if (!isLibraryBodyKind(selectedLibraryItem)) {
      return;
    }

    handleCreateEntityFromKind(selectedLibraryItem, position);
  }

  function handleSelectLibraryItem(itemId: LibraryItemKind) {
    setSelectedLibraryItem(itemId);
    setLibraryDragHover(null);
    setLibraryDragSession(null);

    if (isLibraryBodyKind(itemId)) {
      setConstraintPlacement(null);
      handleToolChange("select");
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

  function handleStartBodyDrag(session: LibraryDragSession) {
    if (authoringLocked) {
      return;
    }

    setSelectedLibraryItem(session.bodyKind);
    setConstraintPlacement(null);
    setLibraryDragHover(null);
    setLibraryDragSession(session);
    handleToolChange("select");
  }

  function handleLibraryDragHoverChange(hover: LibraryDragHoverState | null) {
    if (!libraryDragSession) {
      setLibraryDragHover(null);
      return;
    }

    setLibraryDragHover(hover);
  }

  function handleDeleteSelectedEntity() {
    const deletedEntityId = editorState.selectedEntityId;

    if (!deletedEntityId) {
      return;
    }

    const removedConstraintIds = new Set(
      constraints
        .filter((constraint) =>
          constraint.kind === "spring"
            ? constraint.entityAId === deletedEntityId || constraint.entityBId === deletedEntityId
            : constraint.entityId === deletedEntityId,
        )
        .map((constraint) => constraint.id),
    );

    setEntities((current) =>
      current.filter((entity) => entity.id !== deletedEntityId),
    );
    setConstraints((current) =>
      current.filter((constraint) => !removedConstraintIds.has(constraint.id)),
    );
    setEditorState((current) => ({
      ...current,
      selectedConstraintId:
        current.selectedConstraintId && removedConstraintIds.has(current.selectedConstraintId)
          ? null
          : current.selectedConstraintId,
      selectedEntityId: current.selectedEntityId === deletedEntityId ? null : current.selectedEntityId,
    }));
  }

  const selectedEntity = entities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;
  const selectedConstraint =
    constraints.find((constraint) => constraint.id === editorState.selectedConstraintId) ?? null;
  const displayEntities = projectRuntimeSceneEntities({
    editorEntities: entities,
    runtimeFrame: visibleRuntimeFrame,
    viewport: workspaceViewport,
  });
  const selectedRuntimeVelocityVector =
    transportRuntime.status === "paused" && selectedEntity?.kind === "ball"
      ? (() => {
          const runtimeVelocity = visibleRuntimeFrame?.entities.find(
            (entity) => entity.id === selectedEntity.id && entity.velocity,
          )?.velocity;

          return runtimeVelocity
            ? runtimeVelocityToAuthoring({
                velocityX: runtimeVelocity.x,
                velocityY: runtimeVelocity.y,
              })
            : null;
        })()
      : null;
  const authoringSnapDistance = getDefaultAuthoringSnapDistance(sceneSettings.lengthUnit);
  const authoringLocked = playbackLocked;
  const scenePhysicsState = createScenePhysicsPanelState(sceneSettings, authoringLocked);
  const libraryDragCandidate =
    libraryDragSession && libraryDragHover?.isOverStage && libraryDragHover.authoringPosition
      ? createPlacedEntityCandidate(libraryDragSession.bodyKind, libraryDragHover.authoringPosition)
      : null;
  const libraryDragResolution = libraryDragCandidate
    ? resolveAuthoringPlacement({
        candidate: libraryDragCandidate,
        entities,
        maxSnapDistance: authoringSnapDistance,
      })
    : null;
  const pendingEntityDragPreview =
    pendingEntityDragPlacement &&
    entities.find((entity) => entity.id === pendingEntityDragPlacement.entityId)
      ? (() => {
          const currentEntity = entities.find(
            (entity) => entity.id === pendingEntityDragPlacement.entityId,
          );

          if (!currentEntity) {
            return null;
          }

          const candidate = {
            ...currentEntity,
            x: pendingEntityDragPlacement.position.x,
            y: pendingEntityDragPlacement.position.y,
          };
          const resolution = resolveAuthoringPlacement({
            candidate,
            entities,
            ignoreEntityId: currentEntity.id,
            maxSnapDistance: authoringSnapDistance,
          });

          return createAuthoringPlacementPreview(candidate, resolution);
        })()
      : null;
  const authoringPlacementPreview =
    libraryDragCandidate && libraryDragResolution
      ? createAuthoringPlacementPreview(libraryDragCandidate, libraryDragResolution)
      : pendingEntityDragPreview;
  const libraryDragBlocked = authoringPlacementPreview?.status === "blocked";

  useEffect(() => {
    if (!libraryDragSession) {
      return undefined;
    }

    const currentSession = libraryDragSession;

    function handlePointerUp() {
      const dropPosition = libraryDragHover?.isOverStage ? libraryDragHover.authoringPosition : null;

      if (dropPosition && !authoringLocked) {
        handleCreateEntityFromKind(currentSession.bodyKind, dropPosition);
      }

      setLibraryDragHover(null);
      setLibraryDragSession(null);
    }

    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [authoringLocked, libraryDragHover, libraryDragSession]);

  useEffect(() => {
    if (!pendingEntityDragPlacement) {
      return undefined;
    }

    const currentPlacement = pendingEntityDragPlacement;

    function handleMouseUp() {
      const currentEntity = entities.find((entity) => entity.id === currentPlacement.entityId);

      if (!currentEntity || authoringLocked) {
        setPendingEntityDragPlacement(null);
        return;
      }

      const candidate = {
        ...currentEntity,
        x: currentPlacement.position.x,
        y: currentPlacement.position.y,
      };
      const resolution = resolveAuthoringPlacement({
        candidate,
        entities,
        ignoreEntityId: currentEntity.id,
        maxSnapDistance: authoringSnapDistance,
      });

      if (resolution.status === "snap") {
        setEntities((current) => replaceEntityInCollection(current, resolution.entity));
      }

      setPendingEntityDragPlacement(null);
    }

    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [authoringLocked, authoringSnapDistance, entities, pendingEntityDragPlacement]);

  function handleDuplicateSelectedEntity() {
    if (!selectedEntity) {
      return;
    }

    const nextEntity = applySceneDuplicateOffset(
      createDuplicatedEntity(entities, selectedEntity),
      sceneSettings,
    );

    if (!canPlaceAuthoringCandidate(nextEntity, entities)) {
      return;
    }

    setEntities((current) => [...current, nextEntity]);
    handleSelectEntity(nextEntity.id);
  }

  useEditorHotkeys({
    onCancelInteraction: handleCancelInteraction,
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

  function handleUpdateSelectedEntityRotation(rotationDegrees: number) {
    if (!selectedEntity || selectedEntity.kind === "ball") {
      return;
    }

    const candidate = {
      ...selectedEntity,
      rotationDegrees,
    };
    const resolution = resolveAuthoringPlacement({
      candidate,
      entities,
      ignoreEntityId: selectedEntity.id,
      maxSnapDistance: authoringSnapDistance,
    });

    if (resolution.status === "blocked") {
      return;
    }

    setEntities((current) => replaceEntityInCollection(current, resolution.entity));
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
          lengthUnit:
            typeof nextLengthUnit === "string" && isLengthUnit(nextLengthUnit)
              ? nextLengthUnit
              : undefined,
          velocityUnit:
            typeof nextVelocityUnit === "string" && isVelocityUnit(nextVelocityUnit)
              ? nextVelocityUnit
              : undefined,
          massUnit:
            typeof nextMassUnit === "string" && isMassUnit(nextMassUnit)
              ? nextMassUnit
              : undefined,
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

  function handleCancelInteraction() {
    if (libraryDragSession) {
      setLibraryDragHover(null);
      setLibraryDragSession(null);
      return;
    }

    if (pendingEntityDragPlacement) {
      setPendingEntityDragPlacement(null);
      return;
    }

    if (constraintPlacement) {
      handleCancelConstraintPlacement();
    }
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
      }
      leftPane={
        <DirectManipulationObjectLibraryPanel
          onStartBodyDrag={handleStartBodyDrag}
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
            onUpdateSelectedEntityRotation={handleUpdateSelectedEntityRotation}
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
      <div style={{ display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: "14px" }}>
        <PlaybackTransportDeck
          currentTimeSeconds={currentPlaybackTimeSeconds}
          isPreparing={isPreparing}
          mode={playbackMode}
          onModeChange={handlePlaybackModeChange}
          onPause={handleTransportPause}
          onPrecomputeDurationChange={handlePrecomputeDurationChange}
          onReset={handleTransportReset}
          onSeek={seekPrecomputedPlayback}
          onStart={handleTransportStart}
          onStep={handleTransportStep}
          onTimeScaleChange={handleTransportTimeScaleChange}
          precomputeDurationSeconds={precomputeDurationSeconds}
          preparationProgress={preparationProgress}
          realtimeCapSeconds={realtimeCapSeconds}
          runtime={transportRuntime}
          seekEnabled={seekEnabled}
          timelineMaxSeconds={timelineMaxSeconds}
        />

        <DirectManipulationWorkspaceCanvas
          authoringLocked={authoringLocked}
          authoringPlacementPreview={authoringPlacementPreview}
          constraintPlacement={constraintPlacement}
          constraints={constraints}
          display={displaySettings}
          displayEntities={displayEntities}
          entities={entities}
          libraryDragBlocked={libraryDragBlocked}
          onCancelPlacement={handleCancelConstraintPlacement}
          onCreateEntity={handleCreateEntity}
          onGridVisibleChange={handleGridVisibleChange}
          onLibraryDragHoverChange={handleLibraryDragHoverChange}
          onMoveEntity={handleMoveEntity}
          onPlaceConstraintEntity={handleConstraintEntityPick}
          onPlaceConstraintPoint={handleConstraintPointPick}
          onSelectConstraint={handleSelectConstraint}
          onSelectEntity={handleSelectEntity}
          onToolChange={handleToolChange}
          selectedRuntimeVelocityVector={
            selectedRuntimeVelocityVector && selectedEntity
              ? {
                  entityId: selectedEntity.id,
                  velocityX: selectedRuntimeVelocityVector.velocityX,
                  velocityY: selectedRuntimeVelocityVector.velocityY,
                }
              : null
          }
          state={editorState}
          libraryDragSession={libraryDragSession}
          viewport={workspaceViewport}
        />
        <AnnotationLayer state={annotationState} onStateChange={setAnnotationState} />
      </div>
    </ShellLayout>
  );
}
