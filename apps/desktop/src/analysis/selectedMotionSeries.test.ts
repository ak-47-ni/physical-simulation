import { describe, expect, it } from "vitest";

import { createSelectedMotionSamples } from "./selectedMotionSeries";

describe("selectedMotionSeries", () => {
  it("builds relative displacement and velocity samples for the selected runtime entity", () => {
    const samples = createSelectedMotionSamples(
      [
        {
          timeSeconds: 0,
          frame: {
            frameNumber: 0,
            entities: [
              {
                id: "ball-1",
                transform: { x: 1, y: 2, rotation: 0 },
                velocity: { x: 3, y: 0 },
              },
            ],
          },
        },
        {
          timeSeconds: 0.5,
          frame: {
            frameNumber: 30,
            entities: [
              {
                id: "ball-1",
                transform: { x: 2.25, y: 1.5, rotation: 0 },
                velocity: { x: 2, y: -1 },
              },
              {
                id: "block-1",
                transform: { x: 12, y: 12, rotation: 0 },
                velocity: { x: 0, y: 0 },
              },
            ],
          },
        },
      ],
      "ball-1",
    );

    expect(samples).toEqual([
      {
        displacement: { x: 0, y: 0 },
        frameNumber: 0,
        position: { x: 1, y: 2 },
        speed: 3,
        timeSeconds: 0,
        velocity: { x: 3, y: 0 },
      },
      {
        displacement: { x: 1.25, y: -0.5 },
        frameNumber: 30,
        position: { x: 2.25, y: 1.5 },
        speed: Math.hypot(2, -1),
        timeSeconds: 0.5,
        velocity: { x: 2, y: -1 },
      },
    ]);
  });

  it("ignores frames that do not include the selected entity", () => {
    expect(
      createSelectedMotionSamples(
        [
          {
            timeSeconds: 0,
            frame: {
              frameNumber: 0,
              entities: [
                {
                  id: "block-1",
                  transform: { x: 12, y: 12, rotation: 0 },
                },
              ],
            },
          },
        ],
        "ball-1",
      ),
    ).toEqual([]);
  });
});
