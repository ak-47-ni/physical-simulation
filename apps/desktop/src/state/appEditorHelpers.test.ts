import { describe, expect, it } from "vitest";

import {
  applyConstraintUpdate,
  createConstraintPlacementState,
  createInitialAuthoringState,
} from "./appEditorHelpers";

describe("appEditorHelpers", () => {
  it("starts the authoring scene with a locked board for support-contact demos", () => {
    const initialState = createInitialAuthoringState();
    const board = initialState.entities.find((entity) => entity.kind === "board");

    expect(board?.locked).toBe(true);
  });

  it("starts arc-track placement on the locked-board picking step with empty draft fields", () => {
    expect(createConstraintPlacementState("arc-track")).toEqual({
      anchorEntityId: null,
      boardEndpointKey: null,
      draftCenter: null,
      draftRadius: null,
      draftSpanDegrees: null,
      hint: "Select a locked board for the arc track",
      kind: "arc-track",
      mode: "pick-board",
      stage: "pick-board",
    });
  });

  it("updates the arc-track entry endpoint during inspector refinement", () => {
    const updated = applyConstraintUpdate(
      {
        center: { x: 2.4, y: 1.8 },
        entryEndpoint: "start",
        endAngleDegrees: 135,
        id: "arc-track-1",
        kind: "arc-track",
        label: "Arc track 1",
        radius: 1.2,
        side: "inside",
        startAngleDegrees: -45,
      },
      { entryEndpoint: "end" },
    );

    expect(updated).toMatchObject({
      entryEndpoint: "end",
    });
  });
});
