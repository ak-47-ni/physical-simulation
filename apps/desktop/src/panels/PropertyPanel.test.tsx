import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createSceneDisplaySettings } from "../io/sceneFile";
import { PropertyPanel } from "./PropertyPanel";

afterEach(() => {
  cleanup();
});

const TEST_SCENE_PHYSICS = {
  gravity: 9.8,
  gravityUnitLabel: "m/s²",
  lengthUnit: "m",
  lengthUnitOptions: ["m", "cm"],
  lockReason: null,
  massUnit: "kg",
  massUnitOptions: ["kg", "g"],
  pixelsPerMeter: 100,
  velocityUnit: "m/s",
  velocityUnitOptions: ["m/s", "cm/s"],
} as const;

function BoardSelectionHarness() {
  const [entity, setEntity] = useState({
    id: "board-1",
    kind: "board" as const,
    label: "Board 1",
    x: 3.18,
    y: 2.72,
    width: 1.2,
    height: 0.18,
    rotationDegrees: 30,
    mass: 5,
    friction: 0.42,
    restitution: 0.18,
    locked: false,
    velocityX: 4,
    velocityY: 0,
  });

  return (
    <PropertyPanel
      display={createSceneDisplaySettings()}
      onDeleteSelectedEntity={() => undefined}
      onDuplicateSelectedEntity={() => undefined}
      onScenePhysicsChange={() => undefined}
      onUpdateDisplaySetting={() => undefined}
      onUpdateSelectedEntityLabel={() => undefined}
      onUpdateSelectedEntityPhysics={(physics) => {
        setEntity((current) => ({
          ...current,
          ...physics,
        }));
      }}
      onUpdateSelectedEntityPosition={() => undefined}
      onUpdateSelectedEntityRadius={() => undefined}
      onUpdateSelectedEntityRotation={(rotationDegrees) => {
        setEntity((current) => ({
          ...current,
          rotationDegrees,
        }));
      }}
      onUpdateSelectedEntitySize={() => undefined}
      scenePhysics={TEST_SCENE_PHYSICS}
      selectedEntity={entity}
    />
  );
}

describe("PropertyPanel", () => {
  it("edits selected ball properties and exposes duplicate and delete actions", () => {
    const updates: Array<{ x: number; y: number }> = [];
    const labelUpdates: string[] = [];
    const radiusUpdates: number[] = [];
    const physicsUpdates: Array<Record<string, number | boolean>> = [];
    const deleted: string[] = [];
    const duplicated: string[] = [];

    render(
      <PropertyPanel
        display={createSceneDisplaySettings({
          gridVisible: true,
          showLabels: true,
          showTrajectories: false,
        })}
        onDeleteSelectedEntity={() => {
          deleted.push("ball-1");
        }}
        onDuplicateSelectedEntity={() => {
          duplicated.push("ball-1");
        }}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedEntityLabel={(label) => {
          labelUpdates.push(label);
        }}
        onUpdateSelectedEntityPosition={(position) => {
          updates.push(position);
        }}
        onUpdateSelectedEntityRadius={(radius) => {
          radiusUpdates.push(radius);
        }}
        onUpdateSelectedEntityPhysics={(physics) => {
          physicsUpdates.push(physics);
        }}
        onUpdateSelectedEntitySize={() => undefined}
        selectedEntity={{
          id: "ball-1",
          kind: "ball",
          label: "Ball 1",
          x: 132,
          y: 176,
          radius: 26,
          mass: 1.2,
          friction: 0.14,
          restitution: 0.82,
          locked: false,
          velocityX: 4,
          velocityY: -2,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Entity name"), { target: { value: "Projectile" } });
    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "164" } });
    fireEvent.change(screen.getByLabelText("Position Y"), { target: { value: "214" } });
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Mass"), { target: { value: "1.8" } });
    fireEvent.change(screen.getByLabelText("Friction"), { target: { value: "0.2" } });
    fireEvent.change(screen.getByLabelText("Restitution"), { target: { value: "0.9" } });
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Velocity Y"), { target: { value: "-8" } });
    fireEvent.click(screen.getByLabelText("Locked in simulation"));
    fireEvent.click(screen.getByRole("button", { name: /duplicate entity/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete entity/i }));

    expect(labelUpdates).toEqual(["Projectile"]);
    expect(updates).toEqual([
      { x: 164, y: 176 },
      { x: 132, y: 214 },
    ]);
    expect(radiusUpdates).toEqual([30]);
    expect(physicsUpdates).toEqual([
      { mass: 1.8 },
      { friction: 0.2 },
      { restitution: 0.9 },
      { velocityX: 12 },
      { velocityY: -8 },
      { locked: true },
    ]);
    expect(duplicated).toEqual(["ball-1"]);
    expect(deleted).toEqual(["ball-1"]);
  });

  it("edits rectangular body dimensions", () => {
    const sizeUpdates: Array<{ width: number; height: number }> = [];

    render(
      <PropertyPanel
        display={createSceneDisplaySettings({
          gridVisible: true,
          showLabels: true,
          showTrajectories: false,
        })}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntitySize={(size) => {
          sizeUpdates.push(size);
        }}
        selectedEntity={{
          id: "board-1",
          kind: "board",
          label: "Board 1",
          x: 318,
          y: 272,
          width: 120,
          height: 18,
          rotationDegrees: 0,
          mass: 5,
          friction: 0.42,
          restitution: 0.18,
          locked: false,
          velocityX: 0,
          velocityY: 0,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Width"), { target: { value: "148" } });
    fireEvent.change(screen.getByLabelText("Height"), { target: { value: "24" } });

    expect(sizeUpdates).toEqual([
      { width: 148, height: 18 },
      { width: 120, height: 24 },
    ]);
  });

  it("shows board angle and keeps speed direction synced with cartesian velocity", () => {
    render(<BoardSelectionHarness />);

    expect((screen.getByLabelText("Angle") as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText("Speed") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Direction") as HTMLInputElement).value).toBe("0");

    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "90" } });

    expect(Number((screen.getByLabelText("Velocity X") as HTMLInputElement).value)).toBeCloseTo(0);
    expect(Number((screen.getByLabelText("Velocity Y") as HTMLInputElement).value)).toBeCloseTo(4);

    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "10" } });

    expect(Number((screen.getByLabelText("Velocity X") as HTMLInputElement).value)).toBeCloseTo(0);
    expect(Number((screen.getByLabelText("Velocity Y") as HTMLInputElement).value)).toBeCloseTo(10);

    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Velocity Y"), { target: { value: "8" } });

    expect(Number((screen.getByLabelText("Speed") as HTMLInputElement).value)).toBeCloseTo(10);
    expect(Number((screen.getByLabelText("Direction") as HTMLInputElement).value)).toBeCloseTo(
      53.13,
      2,
    );

    fireEvent.change(screen.getByLabelText("Angle"), { target: { value: "45" } });

    expect((screen.getByLabelText("Angle") as HTMLInputElement).value).toBe("45");
  });

  it("shows the angle control for blocks too", () => {
    render(
      <PropertyPanel
        display={createSceneDisplaySettings()}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onScenePhysicsChange={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntityRotation={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        scenePhysics={TEST_SCENE_PHYSICS}
        selectedEntity={{
          id: "block-1",
          kind: "block",
          label: "Block 1",
          x: 3.36,
          y: 2.2,
          width: 0.84,
          height: 0.52,
          rotationDegrees: 15,
          mass: 2.8,
          friction: 0.36,
          restitution: 1,
          locked: false,
          velocityX: 0,
          velocityY: 0,
        }}
      />,
    );

    expect((screen.getByLabelText("Angle") as HTMLInputElement).value).toBe("15");
  });

  it("does not show the rectangular-body angle control for balls", () => {
    render(
      <PropertyPanel
        display={createSceneDisplaySettings()}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onScenePhysicsChange={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        scenePhysics={TEST_SCENE_PHYSICS}
        selectedEntity={{
          id: "ball-1",
          kind: "ball",
          label: "Ball 1",
          x: 1.32,
          y: 1.76,
          radius: 0.24,
          mass: 1.2,
          friction: 0.14,
          restitution: 0.82,
          locked: false,
          velocityX: 4,
          velocityY: 0,
        }}
      />,
    );

    expect(screen.queryByLabelText("Angle")).toBeNull();
  });

  it("edits display settings toggles", () => {
    const displayUpdates: Array<Record<string, boolean>> = [];

    render(
      <PropertyPanel
        display={createSceneDisplaySettings({
          gridVisible: true,
          showForceVectors: false,
          showLabels: true,
          showTrajectories: false,
          showVelocityVectors: false,
        })}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onUpdateDisplaySetting={(display) => {
          displayUpdates.push(display);
        }}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        selectedEntity={null}
      />,
    );

    fireEvent.click(screen.getByLabelText("Show grid"));
    fireEvent.click(screen.getByLabelText("Show labels"));
    fireEvent.click(screen.getByLabelText("Show velocity vectors"));
    fireEvent.click(screen.getByLabelText("Show force vectors"));

    expect(displayUpdates).toEqual([
      { gridVisible: false },
      { showLabels: false },
      { showVelocityVectors: true },
      { showForceVectors: true },
    ]);
  });

  it("edits selected spring constraints and exposes a delete action", () => {
    const constraintUpdates: Array<{
      axis?: { x: number; y: number };
      origin?: { x: number; y: number };
      restLength?: number;
      stiffness?: number;
    }> = [];
    const deleted: string[] = [];

    render(
      <PropertyPanel
        display={createSceneDisplaySettings()}
        onDeleteSelectedConstraint={() => {
          deleted.push("spring-1");
        }}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedConstraint={(constraint) => {
          constraintUpdates.push(constraint);
        }}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        selectedConstraint={{
          entityAId: "ball-1",
          entityBId: "board-1",
          id: "spring-1",
          kind: "spring",
          label: "Spring 1",
          restLength: 120,
          stiffness: 24,
        }}
        selectedEntity={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Rest length"), { target: { value: "164" } });
    fireEvent.change(screen.getByLabelText("Stiffness"), { target: { value: "38" } });
    fireEvent.click(screen.getByRole("button", { name: /delete constraint/i }));

    expect(constraintUpdates).toEqual([{ restLength: 164 }, { stiffness: 38 }]);
    expect(deleted).toEqual(["spring-1"]);
  });

  it("edits selected track constraints", () => {
    const constraintUpdates: Array<Record<string, number | { x: number; y: number }>> = [];

    render(
      <PropertyPanel
        display={createSceneDisplaySettings()}
        onDeleteSelectedConstraint={() => undefined}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedConstraint={(constraint) => {
          constraintUpdates.push(constraint);
        }}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        selectedConstraint={{
          axis: { x: 180, y: 60 },
          entityId: "ball-1",
          id: "track-1",
          kind: "track",
          label: "Track 1",
          origin: { x: 156, y: 200 },
        }}
        selectedEntity={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Origin X"), { target: { value: "176" } });
    fireEvent.change(screen.getByLabelText("Origin Y"), { target: { value: "214" } });
    fireEvent.change(screen.getByLabelText("Axis X"), { target: { value: "220" } });
    fireEvent.change(screen.getByLabelText("Axis Y"), { target: { value: "84" } });

    expect(constraintUpdates).toEqual([
      { origin: { x: 176, y: 200 } },
      { origin: { x: 156, y: 214 } },
      { axis: { x: 220, y: 60 } },
      { axis: { x: 180, y: 84 } },
    ]);
  });

  it("edits selected arc-track constraints", () => {
    const constraintUpdates: Array<Record<string, unknown>> = [];

    render(
      <PropertyPanel
        display={createSceneDisplaySettings()}
        onDeleteSelectedConstraint={() => undefined}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedConstraint={(constraint) => {
          constraintUpdates.push(constraint);
        }}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        scenePhysics={TEST_SCENE_PHYSICS}
        selectedConstraint={{
          center: { x: 2.4, y: 1.8 },
          endAngleDegrees: 105,
          entityId: "ball-1",
          id: "arc-track-1",
          kind: "arc-track",
          label: "Arc track 1",
          radius: 0.9,
          side: "inside",
          startAngleDegrees: -45,
        }}
        selectedEntity={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Center X"), { target: { value: "2.8" } });
    fireEvent.change(screen.getByLabelText("Center Y"), { target: { value: "2.1" } });
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "1.2" } });
    fireEvent.change(screen.getByLabelText("Start angle"), { target: { value: "-30" } });
    fireEvent.change(screen.getByLabelText("End angle"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Side"), { target: { value: "outside" } });

    expect(constraintUpdates).toEqual([
      { center: { x: 2.8, y: 1.8 } },
      { center: { x: 2.4, y: 2.1 } },
      { radius: 1.2 },
      { startAngleDegrees: -30 },
      { endAngleDegrees: 120 },
      { side: "outside" },
    ]);
  });

  it("renders scene physics controls and unit-aware readouts for the selected entity", () => {
    render(
      <PropertyPanel
        display={createSceneDisplaySettings()}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onScenePhysicsChange={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        scenePhysics={{
          gravity: 9.8,
          gravityUnitLabel: "m/s²",
          lengthUnit: "m",
          lengthUnitOptions: ["m", "cm"],
          lockReason: null,
          massUnit: "kg",
          massUnitOptions: ["kg", "g"],
          pixelsPerMeter: 100,
          velocityUnit: "m/s",
          velocityUnitOptions: ["m/s", "cm/s"],
        }}
        selectedEntity={{
          id: "ball-1",
          kind: "ball",
          label: "Ball 1",
          x: 132,
          y: 176,
          radius: 26,
          mass: 1.2,
          friction: 0.14,
          restitution: 0.82,
          locked: false,
          velocityX: 4,
          velocityY: -2,
        }}
      />,
    );

    expect(screen.getByText("Scene physics")).toBeDefined();
    expect(screen.getByText("132 m, 176 m")).toBeDefined();
    expect(screen.getByText("4 m/s, -2 m/s")).toBeDefined();
    expect(screen.getByText("1.2 kg")).toBeDefined();
    expect(screen.getByText("m/s²")).toBeDefined();
    expect(screen.getAllByText("m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("kg").length).toBeGreaterThan(0);
    expect(screen.getAllByText("m/s").length).toBeGreaterThan(0);
  });

  it("disables property and scene physics inputs while authoring is locked but keeps actions visible", () => {
    render(
      <PropertyPanel
        authoringLocked
        authoringLockReason="Authoring is locked while runtime is playing."
        display={createSceneDisplaySettings()}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onScenePhysicsChange={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        scenePhysics={{
          gravity: 980,
          gravityUnitLabel: "cm/s²",
          lengthUnit: "cm",
          lengthUnitOptions: ["m", "cm"],
          lockReason: "Scene physics is locked while runtime is playing.",
          massUnit: "g",
          massUnitOptions: ["kg", "g"],
          pixelsPerMeter: 100,
          velocityUnit: "cm/s",
          velocityUnitOptions: ["m/s", "cm/s"],
        }}
        selectedEntity={{
          id: "ball-1",
          kind: "ball",
          label: "Ball 1",
          x: 132,
          y: 176,
          radius: 26,
          mass: 1200,
          friction: 0.14,
          restitution: 0.82,
          locked: false,
          velocityX: 400,
          velocityY: -200,
        }}
      />,
    );

    expect(screen.getByText("Authoring is locked while runtime is playing.")).toBeDefined();
    expect((screen.getByLabelText("Entity name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Position X") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Radius") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Mass") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Velocity X") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Gravity") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Length unit") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Pixels per meter") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /duplicate entity/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /delete entity/i })).toBeDefined();
  });

  it("disables arc-track inspector inputs while authoring is locked", () => {
    render(
      <PropertyPanel
        authoringLocked
        authoringLockReason="Authoring is locked while runtime is playing."
        display={createSceneDisplaySettings()}
        onDeleteSelectedConstraint={() => undefined}
        onDeleteSelectedEntity={() => undefined}
        onDuplicateSelectedEntity={() => undefined}
        onUpdateDisplaySetting={() => undefined}
        onUpdateSelectedConstraint={() => undefined}
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPhysics={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
        onUpdateSelectedEntitySize={() => undefined}
        scenePhysics={TEST_SCENE_PHYSICS}
        selectedConstraint={{
          center: { x: 2.4, y: 1.8 },
          endAngleDegrees: 105,
          entityId: "ball-1",
          id: "arc-track-1",
          kind: "arc-track",
          label: "Arc track 1",
          radius: 0.9,
          side: "inside",
          startAngleDegrees: -45,
        }}
        selectedEntity={null}
      />,
    );

    expect((screen.getByLabelText("Center X") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Center Y") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Radius") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Start angle") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("End angle") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Side") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /delete constraint/i })).toBeDefined();
  });
});
