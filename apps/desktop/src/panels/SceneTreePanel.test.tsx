import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SceneTreePanel } from "./SceneTreePanel";

afterEach(() => {
  cleanup();
});

describe("SceneTreePanel", () => {
  it("renders entities and constraints in separate sections and routes selection", () => {
    const entitySelections: string[] = [];
    const constraintSelections: string[] = [];

    render(
      <SceneTreePanel
        constraints={[
          {
            entityAId: "ball-1",
            entityBId: "board-1",
            id: "spring-1",
            kind: "spring",
            label: "Spring 1",
            restLength: 236,
            stiffness: 24,
          },
        ]}
        entities={[
          {
            id: "ball-1",
            kind: "ball",
            label: "Ball 1",
            x: 132,
            y: 176,
            radius: 24,
            mass: 1.2,
            friction: 0.14,
            restitution: 0.82,
            locked: false,
            velocityX: 0,
            velocityY: 0,
          },
        ]}
        onSelectConstraint={(constraintId) => {
          constraintSelections.push(constraintId);
        }}
        onSelectEntity={(entityId) => {
          entitySelections.push(entityId);
        }}
        selectedConstraintId="spring-1"
        selectedEntityId={null}
      />,
    );

    expect(screen.getByText("Constraints")).toBeDefined();
    expect(screen.getByTestId("scene-tree-constraint-spring-1").getAttribute("data-selected")).toBe(
      "true",
    );

    fireEvent.click(screen.getByTestId("scene-tree-item-ball-1"));
    fireEvent.click(screen.getByTestId("scene-tree-constraint-spring-1"));

    expect(entitySelections).toEqual(["ball-1"]);
    expect(constraintSelections).toEqual(["spring-1"]);
  });
});
