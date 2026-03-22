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

    render(
      <PropertyPanel
        display={createSceneDisplaySettings({
          gridVisible: true,
          showLabels: true,
          showTrajectories: false,
        })}
        onUpdateSelectedEntityPosition={(position) => {
          updates.push(position);
        }}
        selectedEntity={{ id: "ball-1", label: "Ball 1", x: 132, y: 176 }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Position X"), { target: { value: "164" } });
    fireEvent.change(screen.getByLabelText("Position Y"), { target: { value: "214" } });

    expect(updates).toEqual([
      { x: 164, y: 176 },
      { x: 132, y: 214 },
    ]);
  });
});
