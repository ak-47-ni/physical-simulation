import type { UnitViewport } from "../workspace/unitViewport";
import {
  resolveAuthoringPlacement,
  type AuthoringPlacementPreview,
} from "./authoringContactSnap";
import { getBoardArcEndpoint, type BoardArcEndpointKey } from "./boardArcPlacement";
import {
  createBoardAnchoredArcTrackConstraint,
  type ArcTrackSpanPresetDegrees,
} from "./createBoardAnchoredArcTrackConstraint";
import {
  createDefaultEditorConstraint,
  type EditorConstraint,
  type LibraryConstraintKind,
} from "./editorConstraints";
import { convertSceneAuthoringUnits } from "./editorSceneDocument";
import {
  createInitialSceneEntities,
  type EditorSceneEntity,
} from "./editorStore";
import {
  createSceneAuthoringSettings,
  type SceneAuthoringSettings,
} from "./sceneAuthoringSettings";
import {
  getGravityUnitLabel,
  quantizeArcTrackRadiusForLengthUnit,
  type LengthUnit,
  type MassUnit,
  type VelocityUnit,
} from "./sceneUnits";

export const SCENE_PHYSICS_LOCK_REASON = "Scene physics is locked while runtime is playing.";

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

export type ConstraintPlacementState = {
  anchorEntityId: string | null;
  boardEndpointKey?: BoardArcEndpointKey | null;
  draftCenter?: { x: number; y: number } | null;
  draftRadius?: number | null;
  draftSpanDegrees?: ArcTrackSpanPresetDegrees | null;
  hint: string;
  kind: LibraryConstraintKind;
  mode: "pick-board" | "pick-board-endpoint" | "pick-center" | "pick-entity" | "pick-point";
  stage:
    | "pick-board"
    | "pick-board-endpoint"
    | "pick-entity"
    | "pick-point"
    | "pick-radius"
    | "pick-span";
};

export type ConstraintUpdate = {
  axis?: { x: number; y: number };
  center?: { x: number; y: number };
  entryEndpoint?: "start" | "end";
  endAngleDegrees?: number;
  origin?: { x: number; y: number };
  radius?: number;
  restLength?: number;
  side?: "inside" | "outside";
  startAngleDegrees?: number;
  stiffness?: number;
};

export type LibraryDragHoverState = {
  authoringPosition: { x: number; y: number } | null;
  isOverStage: boolean;
};

export function getEntityCenter(entity: EditorSceneEntity) {
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

export function isConstraintEntityPlacementMode(
  mode: ConstraintPlacementState["mode"],
): boolean {
  return mode === "pick-entity" || mode === "pick-board";
}

export function isConstraintPointPlacementMode(
  mode: ConstraintPlacementState["mode"],
): boolean {
  return mode === "pick-point" || mode === "pick-center";
}

export function isLengthUnit(value: string): value is LengthUnit {
  return LENGTH_UNIT_OPTIONS.includes(value as LengthUnit);
}

export function isVelocityUnit(value: string): value is VelocityUnit {
  return VELOCITY_UNIT_OPTIONS.includes(value as VelocityUnit);
}

export function isMassUnit(value: string): value is MassUnit {
  return MASS_UNIT_OPTIONS.includes(value as MassUnit);
}

export function createInitialAuthoringState() {
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

export function createWorkspaceViewport(settings: SceneAuthoringSettings): UnitViewport {
  return {
    lengthUnit: settings.lengthUnit,
    pixelsPerMeter: settings.pixelsPerMeter,
  };
}

export function createScenePhysicsPanelState(
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

export function createAuthoringPlacementPreview(
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

export function createConstraintPlacementState(
  kind: LibraryConstraintKind,
): ConstraintPlacementState {
  if (kind === "spring") {
    return {
      anchorEntityId: null,
      boardEndpointKey: null,
      draftCenter: null,
      draftRadius: null,
      draftSpanDegrees: null,
      hint: "Select first body for the spring",
      kind: "spring",
      mode: "pick-entity",
      stage: "pick-entity",
    };
  }

  if (kind === "track") {
    return {
      anchorEntityId: null,
      boardEndpointKey: null,
      draftCenter: null,
      draftRadius: null,
      draftSpanDegrees: null,
      hint: "Select a body for the track",
      kind: "track",
      mode: "pick-entity",
      stage: "pick-entity",
    };
  }

  return {
    anchorEntityId: null,
    boardEndpointKey: null,
    draftCenter: null,
    draftRadius: null,
    draftSpanDegrees: null,
    hint: "Select a locked board for the arc track",
    kind: "arc-track",
    mode: "pick-board",
    stage: "pick-board",
  };
}

export function applyConstraintUpdate(
  constraint: EditorConstraint,
  update: ConstraintUpdate,
): EditorConstraint {
  if (constraint.kind === "spring") {
    return {
      ...constraint,
      restLength: update.restLength ?? constraint.restLength,
      stiffness: update.stiffness ?? constraint.stiffness,
    };
  }

  if (constraint.kind === "track") {
    return {
      ...constraint,
      axis: update.axis ?? constraint.axis,
      origin: update.origin ?? constraint.origin,
    };
  }

  return {
    ...constraint,
    center: update.center ?? constraint.center,
    entryEndpoint: update.entryEndpoint ?? constraint.entryEndpoint,
    endAngleDegrees: update.endAngleDegrees ?? constraint.endAngleDegrees,
    radius: update.radius ?? constraint.radius,
    side: update.side ?? constraint.side,
    startAngleDegrees: update.startAngleDegrees ?? constraint.startAngleDegrees,
  };
}

export function createArcTrackRadiusDraft(input: {
  board: Extract<EditorSceneEntity, { kind: "board" }>;
  endpointKey: BoardArcEndpointKey;
  point: { x: number; y: number };
  lengthUnit: LengthUnit;
}) {
  const endpoint = getBoardArcEndpoint(input.board, input.endpointKey);
  const deltaX = input.point.x - endpoint.point.x;
  const deltaY = input.point.y - endpoint.point.y;
  const rawRadius = Math.hypot(deltaX, deltaY);

  if (rawRadius <= Number.EPSILON) {
    return null;
  }

  const quantizedRadius = quantizeArcTrackRadiusForLengthUnit(rawRadius, input.lengthUnit);

  if (quantizedRadius <= 0) {
    return null;
  }

  return {
    center: {
      x: Number((endpoint.point.x + (deltaX / rawRadius) * quantizedRadius).toFixed(6)),
      y: Number((endpoint.point.y + (deltaY / rawRadius) * quantizedRadius).toFixed(6)),
    },
    radius: quantizedRadius,
  };
}

export function createArcTrackConstraint(
  constraints: EditorConstraint[],
  board: Extract<EditorSceneEntity, { kind: "board" }>,
  center: { x: number; y: number },
  endpointKey: BoardArcEndpointKey,
  spanDegrees?: ArcTrackSpanPresetDegrees,
) {
  const baseConstraint = createDefaultEditorConstraint(constraints, "arc-track");

  if (baseConstraint.kind !== "arc-track") {
    throw new Error("Arc-track creation returned an unexpected constraint kind.");
  }

  return {
    ...baseConstraint,
    ...createBoardAnchoredArcTrackConstraint({
      board,
      center,
      endpointKey,
      id: baseConstraint.id,
      side: baseConstraint.side,
      spanDegrees,
    }),
    label: baseConstraint.label,
  };
}
