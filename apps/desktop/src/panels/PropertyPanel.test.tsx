import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createSceneDisplaySettings } from "../io/sceneFile";
import { PropertyPanel } from "./PropertyPanel";

afterEach(() => {
  cleanup();
});

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
    const constraintUpdates: Array<Record<string, number>> = [];
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
});
