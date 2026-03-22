import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createSceneDisplaySettings } from "../io/sceneFile";
import { PropertyPanel } from "./PropertyPanel";

afterEach(() => {
  cleanup();
});

describe("PropertyPanel", () => {
  it("edits selected entity position through numeric inputs", () => {
    const updates: Array<{ x: number; y: number }> = [];
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
        onUpdateSelectedEntityPosition={(position) => {
          updates.push(position);
        }}
        selectedEntity={{ id: "ball-1", label: "Ball 1", x: 132, y: 176 }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "164" } });
    fireEvent.change(screen.getByLabelText("Position Y"), { target: { value: "214" } });
    fireEvent.click(screen.getByRole("button", { name: /duplicate entity/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete entity/i }));

    expect(updates).toEqual([
      { x: 164, y: 176 },
      { x: 132, y: 214 },
    ]);
    expect(duplicated).toEqual(["ball-1"]);
    expect(deleted).toEqual(["ball-1"]);
  });
});
