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
        onUpdateSelectedEntityLabel={(label) => {
          labelUpdates.push(label);
        }}
        onUpdateSelectedEntityPosition={(position) => {
          updates.push(position);
        }}
        onUpdateSelectedEntityRadius={(radius) => {
          radiusUpdates.push(radius);
        }}
        onUpdateSelectedEntitySize={() => undefined}
        selectedEntity={{ id: "ball-1", kind: "ball", label: "Ball 1", x: 132, y: 176, radius: 26 }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Entity name"), { target: { value: "Projectile" } });
    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "164" } });
    fireEvent.change(screen.getByLabelText("Position Y"), { target: { value: "214" } });
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /duplicate entity/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete entity/i }));

    expect(labelUpdates).toEqual(["Projectile"]);
    expect(updates).toEqual([
      { x: 164, y: 176 },
      { x: 132, y: 214 },
    ]);
    expect(radiusUpdates).toEqual([30]);
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
        onUpdateSelectedEntityLabel={() => undefined}
        onUpdateSelectedEntityPosition={() => undefined}
        onUpdateSelectedEntityRadius={() => undefined}
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
});
