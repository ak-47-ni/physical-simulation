import { describe, expect, it } from "vitest";

import { createInitialRuntimeBridgePortSnapshot } from "./runtimeBridge";
import { createRuntimePreviewFrame } from "./runtimePreview";
import { createSceneAuthoringSettings } from "./sceneAuthoringSettings";

describe("runtimePreview", () => {
  it("moves positive authored velocityY upward first, then bends downward under gravity", () => {
    const settings = createSceneAuthoringSettings({
      gravity: 9.8,
      lengthUnit: "m",
      velocityUnit: "m/s",
      pixelsPerMeter: 100,
    });
    const viewport = {
      lengthUnit: settings.lengthUnit,
      pixelsPerMeter: settings.pixelsPerMeter,
    };
    const entities = [
      {
        id: "ball-1",
        kind: "ball" as const,
        label: "Ball 1",
        x: 0,
        y: 0,
        radius: 1,
        mass: 1,
        friction: 0.14,
        restitution: 1,
        locked: false,
        velocityX: 0,
        velocityY: 4,
      },
    ];
    const initialCenterY = 1;

    const earlyFrame = createRuntimePreviewFrame(entities, settings, viewport, {
      ...createInitialRuntimeBridgePortSnapshot(),
      bridge: {
        ...createInitialRuntimeBridgePortSnapshot().bridge,
        currentTimeSeconds: 0.2,
      },
      nextFrameNumber: 12,
    });
    const lateFrame = createRuntimePreviewFrame(entities, settings, viewport, {
      ...createInitialRuntimeBridgePortSnapshot(),
      bridge: {
        ...createInitialRuntimeBridgePortSnapshot().bridge,
        currentTimeSeconds: 1,
      },
      nextFrameNumber: 60,
    });

    expect(earlyFrame.entities[0]?.position.y).toBeLessThan(initialCenterY);
    expect(lateFrame.entities[0]?.position.y).toBeGreaterThan(initialCenterY);
  });
});
