import { useEffect, useRef, useState, type CSSProperties } from "react";

import { AnalysisPanel } from "./analysis/AnalysisPanel";
import { AnnotationLayer, createInitialAnnotationLayerState } from "./annotation/AnnotationLayer";
import { LanguageProvider } from "./i18n";
import { createSceneDisplaySettings, type SceneDisplaySettings } from "./io/sceneFile";
import { ShellLayout } from "./layout/ShellLayout";
import { ObjectLibraryPanel } from "./panels/ObjectLibraryPanel";
import { PlaybackTransportDeck } from "./panels/PlaybackTransportDeck";
import { PropertyPanel } from "./panels/PropertyPanel";
import { ScenePhysicsCard } from "./panels/property/ScenePhysicsCard";
import { SceneTreePanel } from "./panels/SceneTreePanel";
import {
  createSpringConstraintFromEntities,
  createTrackConstraintFromEntityAndPoint,
  type EditorConstraint,
} from "./state/editorConstraints";
import {
  createDuplicatedEntity,
  createPlacedBodyEntity,
  createInitialEditorState,
  type EditorEntityPhysics,
  type EditorSceneEntity,
  type LibraryBodyKind,
  type LibraryItemKind,
  isLibraryBodyKind,
} from "./state/editorStore";
import {
  applyConstraintUpdate,
  createArcTrackRadiusDraft,
  createArcTrackConstraint,
  createAuthoringPlacementPreview,
  createConstraintPlacementState,
  createInitialAuthoringState,
  createScenePhysicsPanelState,
  createWorkspaceViewport,
  getEntityCenter,
  isConstraintEntityPlacementMode,
  isLengthUnit,
  isMassUnit,
  isVelocityUnit,
  type ConstraintPlacementState,
  type ConstraintUpdate,
  type LibraryDragHoverState,
} from "./state/appEditorHelpers";
import {
  applySceneDuplicateOffset,
  canPlaceAuthoringCandidate,
  convertLegacyCreatedEntityToSceneUnits,
  findRepositionedAuthoringEntity,
  replaceEntityInCollection,
  resolveAuthoringPlacementForCommit,
} from "./state/authoringPlacementGuards";
import { convertSceneAuthoringUnits } from "./state/editorSceneDocument";
import {
  getDefaultAuthoringSnapDistance,
  resolveAuthoringPlacement,
  type AuthoringPlacementPreview,
} from "./state/authoringContactSnap";
import { createMockRuntimeBridgePort } from "./state/runtimeBridge";
import { createDesktopRuntimeBridgePort } from "./state/desktopRuntimeBridgePort";
import { createRuntimeCompileRequestFromEditorState } from "./state/runtimeCompileRequest";
import { createRuntimePreviewFrame, createRuntimePreviewTrajectorySamples } from "./state/runtimePreview";
import { quantizeArcTrackRadiusForLengthUnit } from "./state/sceneUnits";
import { runtimeVelocityToAuthoring } from "./state/velocitySemantics";
import { createSceneAuthoringSettings, type SceneAuthoringSettings } from "./state/sceneAuthoringSettings";
import { useDualPlaybackController } from "./state/useDualPlaybackController";
import { useEditorHotkeys } from "./state/useEditorHotkeys";
import type { LibraryDragSession } from "./workspace/libraryDragSession";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import { projectRuntimeSceneEntities } from "./workspace/runtimeSceneView";
import type { EditorTool } from "./workspace/tools";

const PRIMARY_ANALYZER_ID = "traj-primary";
const AUTHORING_LOCK_REASON = "Authoring is locked while runtime is playing.";

const workspaceCenterStackStyle: CSSProperties = {
  alignContent: "start",
  display: "grid",
  gap: "14px",
  gridTemplateRows: "auto auto auto",
};

type PendingEntityDragPlacement = {
  entityId: string;
  position: { x: number; y: number };
};

type ArcTrackEntity = Extract<EditorSceneEntity, { kind: "arc-track" }>;
type ArcTrackAnchorableEntity = Extract<EditorSceneEntity, { kind: "board" | "block" }>;
type ArcTrackAnchorTarget = {
  endpoint: "start" | "end";
  entityId: string;
  entityKind: "board" | "block";
  point: { x: number; y: number };
  tangent: { x: number; y: number };
};

function addVectors(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
  };
}

function subtractVectors(a: { x: number; y: number }, b: { x: number; y: number }) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

function scaleVector(vector: { x: number; y: number }, scalar: number) {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
  };
}

function dotProduct(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

function roundArcTrackValue(value: number) {
  return Number(value.toFixed(6));
}

function normalizeSignedAngleDegrees(angleDegrees: number) {
  const normalized = ((angleDegrees + 180) % 360 + 360) % 360 - 180;

  return roundArcTrackValue(normalized === -180 ? 180 : normalized);
}

function readAngularDistanceDegrees(a: number, b: number) {
  return Math.abs(normalizeSignedAngleDegrees(a - b));
}

function readRadiusVector(radius: number, angleDegrees: number) {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: radius * Math.cos(angleRadians),
    y: -radius * Math.sin(angleRadians),
  };
}

function readIncreasingArcTangent(angleDegrees: number) {
  const angleRadians = (angleDegrees * Math.PI) / 180;

  return {
    x: -Math.sin(angleRadians),
    y: -Math.cos(angleRadians),
  };
}

function readAngleForEntryTangent(
  tangent: { x: number; y: number },
  entryEndpoint: "start" | "end",
) {
  return normalizeSignedAngleDegrees(
    (Math.atan2(
      entryEndpoint === "start" ? -tangent.x : tangent.x,
      entryEndpoint === "start" ? -tangent.y : tangent.y,
    ) *
      180) /
      Math.PI,
  );
}

function readArcTrackRectangleAxes(entity: ArcTrackAnchorableEntity) {
  const rotationRadians = ((entity.rotationDegrees ?? 0) * Math.PI) / 180;
  const axisX = {
    x: Math.cos(rotationRadians),
    y: Math.sin(rotationRadians),
  };
  const axisY = {
    x: -axisX.y,
    y: axisX.x,
  };

  return { axisX, axisY };
}

function readArcTrackAnchorTargetsForEntity(
  entity: ArcTrackAnchorableEntity,
): [ArcTrackAnchorTarget, ArcTrackAnchorTarget] {
  const center = getEntityCenter(entity);
  const { axisX, axisY } = readArcTrackRectangleAxes(entity);
  const topCenter = addVectors(center, scaleVector(axisY, -entity.height / 2));
  const halfWidthOffset = scaleVector(axisX, entity.width / 2);

  return [
    {
      endpoint: "start",
      entityId: entity.id,
      entityKind: entity.kind,
      point: addVectors(topCenter, scaleVector(halfWidthOffset, -1)),
      tangent: scaleVector(axisX, -1),
    },
    {
      endpoint: "end",
      entityId: entity.id,
      entityKind: entity.kind,
      point: addVectors(topCenter, halfWidthOffset),
      tangent: axisX,
    },
  ];
}

function readDistanceToAnchorableEntity(
  entity: ArcTrackAnchorableEntity,
  position: { x: number; y: number },
) {
  const center = getEntityCenter(entity);
  const { axisX, axisY } = readArcTrackRectangleAxes(entity);
  const offset = subtractVectors(position, center);
  const localX = dotProduct(offset, axisX);
  const localY = dotProduct(offset, axisY);
  const outsideX = Math.max(Math.abs(localX) - entity.width / 2, 0);
  const outsideY = Math.max(Math.abs(localY) - entity.height / 2, 0);

  return Math.hypot(outsideX, outsideY);
}

function resolveArcTrackAnchorTarget(input: {
  entities: EditorSceneEntity[];
  maxSnapDistance: number;
  position: { x: number; y: number };
}): ArcTrackAnchorTarget | null {
  let closest:
    | (ArcTrackAnchorTarget & { endpointDistance: number; entityDistance: number })
    | null = null;

  for (const entity of input.entities) {
    if (entity.kind !== "board" && entity.kind !== "block") {
      continue;
    }

    const entityDistance = readDistanceToAnchorableEntity(entity, input.position);

    if (entityDistance > input.maxSnapDistance) {
      continue;
    }

    for (const target of readArcTrackAnchorTargetsForEntity(entity)) {
      const endpointDistance = Math.hypot(
        input.position.x - target.point.x,
        input.position.y - target.point.y,
      );

      if (
        !closest ||
        entityDistance < closest.entityDistance ||
        (entityDistance === closest.entityDistance &&
          endpointDistance < closest.endpointDistance) ||
        (entityDistance === closest.entityDistance &&
          endpointDistance === closest.endpointDistance &&
          target.entityId.localeCompare(closest.entityId) < 0) ||
        (entityDistance === closest.entityDistance &&
          endpointDistance === closest.endpointDistance &&
          target.entityId === closest.entityId &&
          target.endpoint.localeCompare(closest.endpoint) < 0)
      ) {
        closest = {
          ...target,
          endpointDistance,
          entityDistance,
        };
      }
    }
  }

  return closest;
}

function createAnchoredArcTrackEntity(input: {
  anchorTarget: ArcTrackAnchorTarget;
  baseEntity: ArcTrackEntity;
  preferredEntryEndpoint?: "start" | "end";
  radius?: number;
  requestedRotationDegrees?: number;
  sweepAngleDegrees?: number;
}): ArcTrackEntity {
  const radius = input.radius ?? input.baseEntity.radius;
  const sweepAngleDegrees = input.sweepAngleDegrees ?? input.baseEntity.sweepAngleDegrees;
  const startRotationDegrees =
    readAngleForEntryTangent(input.anchorTarget.tangent, "start") + sweepAngleDegrees / 2;
  const endRotationDegrees =
    readAngleForEntryTangent(input.anchorTarget.tangent, "end") - sweepAngleDegrees / 2;
  const entryEndpoint =
    input.requestedRotationDegrees !== undefined
      ? readAngularDistanceDegrees(input.requestedRotationDegrees, startRotationDegrees) <=
        readAngularDistanceDegrees(input.requestedRotationDegrees, endRotationDegrees)
        ? "start"
        : "end"
      : (input.preferredEntryEndpoint ?? input.baseEntity.entryEndpoint ?? "start");
  const entryAngleDegrees = readAngleForEntryTangent(input.anchorTarget.tangent, entryEndpoint);
  const rotationDegrees =
    entryEndpoint === "start"
      ? normalizeSignedAngleDegrees(entryAngleDegrees + sweepAngleDegrees / 2)
      : normalizeSignedAngleDegrees(entryAngleDegrees - sweepAngleDegrees / 2);
  const radiusVector = readRadiusVector(radius, entryAngleDegrees);

  return {
    ...input.baseEntity,
    anchorEntityId: input.anchorTarget.entityId,
    anchorEntityKind: input.anchorTarget.entityKind,
    anchorEndpoint: input.anchorTarget.endpoint,
    center: {
      x: roundArcTrackValue(input.anchorTarget.point.x - radiusVector.x),
      y: roundArcTrackValue(input.anchorTarget.point.y - radiusVector.y),
    },
    entryEndpoint,
    radius,
    rotationDegrees,
    sweepAngleDegrees,
    centralAngleDegrees: sweepAngleDegrees,
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
  const [pendingCalculateStart, setPendingCalculateStart] = useState(false);

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

  useEffect(() => {
    if (!pendingCalculateStart || playbackMode !== "precomputed") {
      return;
    }

    setPendingCalculateStart(false);
    void handleTransportStart();
  }, [handleTransportStart, pendingCalculateStart, playbackMode]);

  function handleCalculateFirstTransportStart() {
    if (playbackMode === "precomputed") {
      void handleTransportStart();
      return;
    }

    setPendingCalculateStart(true);
    handlePlaybackModeChange("precomputed");
  }

  const transportDeckRuntime =
    playbackMode === "precomputed"
      ? {
          ...transportRuntime,
          blockReason:
            transportRuntime.canSeek || runtimeSnapshot.bridge.blockReason !== "rebuild-required"
              ? transportRuntime.blockReason
              : "rebuild-required",
        }
      : {
          ...transportRuntime,
          playbackMode: "precomputed" as const,
        };

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
    if (constraintPlacement && isConstraintEntityPlacementMode(constraintPlacement.mode)) {
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
      lengthUnit: sceneSettings.lengthUnit,
      position,
    });

    if (!nextEntity) {
      return false;
    }

    setEntities((current) =>
      reconcileAnchoredArcTrackEntities(replaceEntityInCollection(current, nextEntity)),
    );
    handleSelectEntity(entityId);

    return true;
  }

  function handleMoveEntity(entityId: string, position: { x: number; y: number }) {
    const entity = entities.find((candidate) => candidate.id === entityId);

    if (entity?.kind === "arc-track") {
      return;
    }

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

  function createArcTrackBaseEntity(position: { x: number; y: number }): ArcTrackEntity {
    const created = convertLegacyCreatedEntityToSceneUnits(
      createPlacedBodyEntity(entities, "arc-track", position),
      sceneSettings,
      position,
    );

    if (created.kind !== "arc-track") {
      throw new Error("Arc-track creation returned a non arc-track entity.");
    }

    return created;
  }

  function resolveStoredArcTrackAnchorTarget(entity: ArcTrackEntity, catalog: EditorSceneEntity[]) {
    const anchorEntity = catalog.find(
      (candidate): candidate is ArcTrackAnchorableEntity =>
        candidate.id === entity.anchorEntityId && candidate.kind === entity.anchorEntityKind,
    );

    if (!anchorEntity) {
      return null;
    }

    return readArcTrackAnchorTargetsForEntity(anchorEntity).find(
      (target) => target.endpoint === entity.anchorEndpoint,
    ) ?? null;
  }

  function reconcileAnchoredArcTrackEntities(catalog: EditorSceneEntity[]) {
    return catalog.map((entity) => {
      if (entity.kind !== "arc-track") {
        return entity;
      }

      const anchorTarget = resolveStoredArcTrackAnchorTarget(entity, catalog);

      if (!anchorTarget) {
        return entity;
      }

      return createAnchoredArcTrackEntity({
        anchorTarget,
        baseEntity: entity,
        preferredEntryEndpoint: entity.entryEndpoint,
      });
    });
  }

  function resolveArcTrackPlacementPreview(position: { x: number; y: number }) {
    const baseEntity = createArcTrackBaseEntity(position);
    const anchorTarget = resolveArcTrackAnchorTarget({
      entities,
      maxSnapDistance: authoringSnapDistance,
      position,
    });

    if (!anchorTarget) {
      return {
        entity: baseEntity,
        status: "blocked" as const,
      };
    }

    return {
      contactWithEntityId: anchorTarget.entityId,
      entity: createAnchoredArcTrackEntity({
        anchorTarget,
        baseEntity,
      }),
      status: "snap" as const,
    };
  }

  function updateSelectedEntity(
    updater: (entity: EditorSceneEntity) => EditorSceneEntity,
  ) {
    if (!editorState.selectedEntityId) {
      return;
    }

    setEntities((current) =>
      reconcileAnchoredArcTrackEntities(
        current.map((entity) =>
          entity.id === editorState.selectedEntityId ? updater(entity) : entity,
        ),
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
    if (kind === "arc-track") {
      const preview = resolveArcTrackPlacementPreview(position);

      if (preview.status !== "snap") {
        return;
      }

      setEntities((current) => [...current, preview.entity]);
      handleSelectEntity(preview.entity.id);
      return;
    }

    const nextEntity = createPlacedEntityCandidate(kind, position);
    const resolution = resolveAuthoringPlacementForCommit({
      candidate: nextEntity,
      entities,
      lengthUnit: sceneSettings.lengthUnit,
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
    setConstraintPlacement(createConstraintPlacementState(itemId));
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
            : constraint.kind === "track"
              ? constraint.entityId === deletedEntityId
              : false,
        )
        .map((constraint) => constraint.id),
    );
    const removedArcTrackIds = new Set(
      entities
        .filter(
          (entity): entity is ArcTrackEntity =>
            entity.kind === "arc-track" && entity.anchorEntityId === deletedEntityId,
        )
        .map((entity) => entity.id),
    );

    setEntities((current) =>
      current.filter(
        (entity) =>
          entity.id !== deletedEntityId && !removedArcTrackIds.has(entity.id),
      ),
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
      selectedEntityId:
        current.selectedEntityId === deletedEntityId ||
        (current.selectedEntityId !== null && removedArcTrackIds.has(current.selectedEntityId))
          ? null
          : current.selectedEntityId,
    }));
  }

  const selectedEntity = entities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;
  const selectedConstraint =
    constraints.find((constraint) => constraint.id === editorState.selectedConstraintId) ?? null;
  const workspaceEntities = entities;
  const displayEntities = projectRuntimeSceneEntities({
    editorEntities: workspaceEntities,
    runtimeFrame: visibleRuntimeFrame,
    viewport: workspaceViewport,
  });
  const selectedRuntimeVelocityVector =
    visibleRuntimeFrame && selectedEntity
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
  const libraryDragArcTrackPreview =
    libraryDragSession?.bodyKind === "arc-track" &&
    libraryDragHover?.isOverStage &&
    libraryDragHover.authoringPosition
      ? resolveArcTrackPlacementPreview(libraryDragHover.authoringPosition)
      : null;
  const libraryDragCandidate =
    libraryDragSession &&
    libraryDragSession.bodyKind !== "arc-track" &&
    libraryDragHover?.isOverStage &&
    libraryDragHover.authoringPosition
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

          if (currentEntity.kind === "arc-track") {
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
    libraryDragArcTrackPreview ??
    (libraryDragCandidate && libraryDragResolution
      ? createAuthoringPlacementPreview(libraryDragCandidate, libraryDragResolution)
      : pendingEntityDragPreview);
  const workspaceAuthoringPlacementPreview = authoringPlacementPreview;
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
      const resolution = resolveAuthoringPlacementForCommit({
        candidate,
        entities,
        ignoreEntityId: currentEntity.id,
        lengthUnit: sceneSettings.lengthUnit,
        maxSnapDistance: authoringSnapDistance,
      });

      if (resolution.status !== "blocked") {
        setEntities((current) =>
          reconcileAnchoredArcTrackEntities(
            replaceEntityInCollection(current, resolution.entity),
          ),
        );
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
      if (entity.kind === "ball" || entity.kind === "arc-track") {
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
    if (
      !selectedEntity ||
      selectedEntity.kind === "ball" ||
      selectedEntity.kind === "arc-track"
    ) {
      return;
    }

    const candidate = {
      ...selectedEntity,
      rotationDegrees,
    };
    const resolution = resolveAuthoringPlacementForCommit({
      candidate,
      entities,
      ignoreEntityId: selectedEntity.id,
      lengthUnit: sceneSettings.lengthUnit,
      maxSnapDistance: authoringSnapDistance,
    });

    if (resolution.status === "blocked") {
      return;
    }

    setEntities((current) =>
      reconcileAnchoredArcTrackEntities(replaceEntityInCollection(current, resolution.entity)),
    );
  }

  function handleUpdateSelectedEntityPhysics(physics: Partial<EditorEntityPhysics>) {
    updateSelectedEntity((entity) => {
      if (entity.kind === "arc-track") {
        return entity;
      }

      return {
        ...entity,
        ...physics,
      };
    });
  }

  function handleUpdateSelectedArcTrack(update: {
    radius?: number;
    rotationDegrees?: number;
    sweepAngleDegrees?: number;
  }) {
    updateSelectedEntity((entity) => {
      if (entity.kind !== "arc-track") {
        return entity;
      }

      const anchorTarget = resolveStoredArcTrackAnchorTarget(entity, entities);

      if (!anchorTarget) {
        return entity;
      }

      return createAnchoredArcTrackEntity({
        anchorTarget,
        baseEntity: entity,
        preferredEntryEndpoint:
          update.rotationDegrees === undefined ? entity.entryEndpoint : undefined,
        radius:
          update.radius === undefined
            ? entity.radius
            : quantizeArcTrackRadiusForLengthUnit(update.radius, sceneSettings.lengthUnit),
        requestedRotationDegrees: update.rotationDegrees,
        sweepAngleDegrees: update.sweepAngleDegrees ?? entity.sweepAngleDegrees,
      });
    });
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

        return applyConstraintUpdate(constraint, update);
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
          stage: "pick-entity",
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

    if (constraintPlacement.kind === "track") {
      setConstraintPlacement({
        ...constraintPlacement,
        anchorEntityId: entityId,
        boardEndpointKey: null,
        draftCenter: null,
        draftRadius: null,
        draftSpanDegrees: null,
        hint: "Pick a point to define the track axis",
        mode: "pick-point",
        stage: "pick-point",
      });
      return;
    }

    const boardEntity = entities.find(
      (entity): entity is Extract<EditorSceneEntity, { kind: "board" }> =>
        entity.id === entityId && entity.kind === "board" && entity.locked,
    );

    if (!boardEntity) {
      return;
    }

    setConstraintPlacement({
      ...constraintPlacement,
      anchorEntityId: boardEntity.id,
      boardEndpointKey: null,
      draftCenter: null,
      draftRadius: null,
      draftSpanDegrees: null,
      hint: "Select the board endpoint for the arc junction",
      mode: "pick-board-endpoint",
      stage: "pick-board-endpoint",
    });
  }

  function handleConstraintBoardEndpointPick(endpointKey: "start" | "end") {
    if (
      !constraintPlacement ||
      constraintPlacement.kind !== "arc-track" ||
      constraintPlacement.mode !== "pick-board-endpoint"
    ) {
      return;
    }

    setConstraintPlacement({
      ...constraintPlacement,
      boardEndpointKey: endpointKey,
      draftCenter: null,
      draftRadius: null,
      draftSpanDegrees: null,
      hint: "Pick a point to set the arc radius",
      mode: "pick-center",
      stage: "pick-radius",
    });
  }

  function handlePendingArcSpanPresetApply(spanDegrees: 90 | 180 | 270) {
    if (
      !constraintPlacement ||
      constraintPlacement.kind !== "arc-track" ||
      constraintPlacement.stage !== "pick-span" ||
      !constraintPlacement.anchorEntityId ||
      !constraintPlacement.boardEndpointKey ||
      !constraintPlacement.draftCenter
    ) {
      return;
    }

    const board = entities.find(
      (entity): entity is Extract<EditorSceneEntity, { kind: "board" }> =>
        entity.id === constraintPlacement.anchorEntityId &&
        entity.kind === "board" &&
        entity.locked,
    );

    if (!board) {
      return;
    }

    setConstraints((current) => [
      ...current,
      createArcTrackConstraint(
        current,
        board,
        constraintPlacement.draftCenter,
        constraintPlacement.boardEndpointKey,
        spanDegrees,
      ),
    ]);
    finishConstraintPlacement();
  }

  function handleConstraintPointPick(position: { x: number; y: number }) {
    if (!constraintPlacement || !constraintPlacement.anchorEntityId) {
      return;
    }

    const anchorEntityId = constraintPlacement.anchorEntityId;

    if (constraintPlacement.kind === "track") {
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
      return;
    }

    if (!constraintPlacement.boardEndpointKey) {
      return;
    }

    const board = entities.find(
      (entity): entity is Extract<EditorSceneEntity, { kind: "board" }> =>
        entity.id === anchorEntityId && entity.kind === "board" && entity.locked,
    );

    if (!board) {
      return;
    }

    if (constraintPlacement.stage !== "pick-radius") {
      return;
    }

    const draft = createArcTrackRadiusDraft({
      board,
      endpointKey: constraintPlacement.boardEndpointKey,
      lengthUnit: sceneSettings.lengthUnit,
      point: position,
    });

    if (!draft) {
      return;
    }

    setConstraintPlacement({
      ...constraintPlacement,
      draftCenter: draft.center,
      draftRadius: draft.radius,
      draftSpanDegrees: null,
      hint: "Choose an arc span preset to create the arc track",
      mode: "pick-center",
      stage: "pick-span",
    });
  }

  return (
    <LanguageProvider>
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
          <div style={{ display: "grid", gap: "16px" }}>
            <ScenePhysicsCard
              disabled={authoringLocked}
              gravity={scenePhysicsState.gravity}
              gravityUnitLabel={scenePhysicsState.gravityUnitLabel}
              lengthUnit={scenePhysicsState.lengthUnit}
              lengthUnitOptions={scenePhysicsState.lengthUnitOptions}
              lockReason={scenePhysicsState.lockReason}
              massUnit={scenePhysicsState.massUnit}
              massUnitOptions={scenePhysicsState.massUnitOptions}
              pixelsPerMeter={scenePhysicsState.pixelsPerMeter}
              velocityUnit={scenePhysicsState.velocityUnit}
              velocityUnitOptions={scenePhysicsState.velocityUnitOptions}
              onGravityChange={(gravity) => handleScenePhysicsChange({ gravity })}
              onLengthUnitChange={(lengthUnit) => handleScenePhysicsChange({ lengthUnit })}
              onMassUnitChange={(massUnit) => handleScenePhysicsChange({ massUnit })}
              onPixelsPerMeterChange={(pixelsPerMeter) =>
                handleScenePhysicsChange({ pixelsPerMeter })
              }
              onVelocityUnitChange={(velocityUnit) => handleScenePhysicsChange({ velocityUnit })}
            />
            <ObjectLibraryPanel
              onStartBodyDrag={handleStartBodyDrag}
              onSelectItem={handleSelectLibraryItem}
              selectedItemId={selectedLibraryItem}
            />
          </div>
        }
        rightPane={
          <div style={{ display: "grid", gap: "16px" }}>
            <PropertyPanel
              authoringLocked={authoringLocked}
              authoringLockReason={AUTHORING_LOCK_REASON}
              display={displaySettings}
              onApplyPendingArcSpanPreset={handlePendingArcSpanPresetApply}
              onDeleteSelectedConstraint={handleDeleteSelectedConstraint}
              onDeleteSelectedEntity={handleDeleteSelectedEntity}
              onDuplicateSelectedEntity={handleDuplicateSelectedEntity}
              onScenePhysicsChange={handleScenePhysicsChange}
              onUpdateDisplaySetting={handleUpdateDisplaySetting}
              onUpdateSelectedArcTrack={handleUpdateSelectedArcTrack}
              onUpdateSelectedConstraint={handleUpdateSelectedConstraint}
              onUpdateSelectedEntityLabel={handleUpdateSelectedEntityLabel}
              onUpdateSelectedEntityPosition={handleUpdateSelectedEntityPosition}
              onUpdateSelectedEntityPhysics={handleUpdateSelectedEntityPhysics}
              onUpdateSelectedEntityRadius={handleUpdateSelectedEntityRadius}
              onUpdateSelectedEntityRotation={handleUpdateSelectedEntityRotation}
              onUpdateSelectedEntitySize={handleUpdateSelectedEntitySize}
              pendingConstraintPlacement={constraintPlacement}
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
        <div data-testid="workspace-center-stack" style={workspaceCenterStackStyle}>
          <PlaybackTransportDeck
            currentTimeSeconds={currentPlaybackTimeSeconds}
            isPreparing={isPreparing}
            mode="precomputed"
            onModeChange={handlePlaybackModeChange}
            onPause={handleTransportPause}
            onPrecomputeDurationChange={handlePrecomputeDurationChange}
            onReset={handleTransportReset}
            onSeek={seekPrecomputedPlayback}
            onStart={handleCalculateFirstTransportStart}
            onStep={handleTransportStep}
            onTimeScaleChange={handleTransportTimeScaleChange}
            precomputeDurationSeconds={precomputeDurationSeconds}
            preparationProgress={preparationProgress}
            realtimeCapSeconds={realtimeCapSeconds}
            runtime={transportDeckRuntime}
            seekEnabled={seekEnabled}
            timelineMaxSeconds={precomputeDurationSeconds}
          />

          <WorkspaceCanvas
            authoringLocked={authoringLocked}
            authoringPlacementPreview={workspaceAuthoringPlacementPreview}
            constraintPlacement={constraintPlacement}
            constraints={constraints}
            display={displaySettings}
            displayEntities={displayEntities}
            entities={workspaceEntities}
            libraryDragBlocked={libraryDragBlocked}
            onCancelPlacement={handleCancelConstraintPlacement}
            onCreateEntity={handleCreateEntity}
            onGridVisibleChange={handleGridVisibleChange}
            onLibraryDragHoverChange={handleLibraryDragHoverChange}
            onMoveEntity={handleMoveEntity}
            onPlaceConstraintBoardEndpoint={handleConstraintBoardEndpointPick}
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
    </LanguageProvider>
  );
}
