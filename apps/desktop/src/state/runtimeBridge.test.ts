import { describe, expect, it } from "vitest";

import {
  createEmptySceneDocument,
  createRuntimeFramePayload,
  createUserPolygonEntity,
} from "../../../../packages/scene-schema/src";
import {
  applyRuntimeFrame,
  createCompileRequestFromScene,
  createInitialRuntimeBridgeState,
  markRuntimeBridgeRebuilt,
  markRuntimeBridgeSceneDirty,
  pauseRuntimeBridge,
  resumeRuntimeBridge,
} from "./runtimeBridge";

describe("runtimeBridge", () => {
  it("builds a compile request from editor scene data", () => {
    const scene = createEmptySceneDocument();

    scene.entities.push(
      createUserPolygonEntity({
        id: "ramp-1",
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 2 },
          { x: 0, y: 2 },
        ],
      }),
    );

    const request = createCompileRequestFromScene(scene, ["analysis"]);

    expect(request).toMatchObject({
      dirtyScopes: ["analysis"],
      rebuildRequired: false,
      scene,
    });
    expect(request.scene).not.toBe(scene);
    expect(request.scene.entities[0]).toEqual(scene.entities[0]);
  });

  it("maps a runtime frame payload into UI runtime state", () => {
    const frame = createRuntimeFramePayload({
      frameNumber: 4,
      entities: [
        {
          entityId: "ball-1",
          position: { x: 12, y: 18 },
          rotation: 0.5,
          velocity: { x: 4, y: -2 },
          acceleration: { x: 0, y: -9.8 },
        },
      ],
    });

    const state = applyRuntimeFrame(createInitialRuntimeBridgeState(), frame);

    expect(state.currentFrame).toEqual({
      frameNumber: 4,
      entities: [
        {
          id: "ball-1",
          transform: {
            x: 12,
            y: 18,
            rotation: 0.5,
          },
          velocity: { x: 4, y: -2 },
          acceleration: { x: 0, y: -9.8 },
        },
      ],
    });
  });

  it("blocks resume after structural or physical edits until rebuild completes", () => {
    const initial = createInitialRuntimeBridgeState();
    const running = resumeRuntimeBridge(initial);
    const paused = pauseRuntimeBridge(running);
    const dirty = markRuntimeBridgeSceneDirty(paused, ["physics"]);

    expect(dirty.status).toBe("paused");
    expect(dirty.canResume).toBe(false);
    expect(dirty.blockReason).toBe("rebuild-required");

    const blockedResume = resumeRuntimeBridge(dirty);

    expect(blockedResume.status).toBe("paused");
    expect(blockedResume.canResume).toBe(false);

    const rebuilt = markRuntimeBridgeRebuilt(dirty);
    const resumed = resumeRuntimeBridge(rebuilt);

    expect(rebuilt.canResume).toBe(true);
    expect(rebuilt.blockReason).toBe(null);
    expect(resumed.status).toBe("running");
  });
});
