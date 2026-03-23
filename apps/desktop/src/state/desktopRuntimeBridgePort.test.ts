import { describe, expect, it } from "vitest";

import {
  createEmptySceneDocument,
  createRuntimeFramePayload,
} from "../../../../packages/scene-schema/src";
import {
  createMockRuntimeBridgePort,
  createRuntimeCompileRequest,
  type RuntimeBridgePortSnapshot,
  type RuntimeBridgeStatusSnapshot,
} from "./runtimeBridge";
import {
  createDesktopRuntimeBridgePort,
  type RuntimeBridgeInvoke,
} from "./desktopRuntimeBridgePort";

describe("desktopRuntimeBridgePort", () => {
  it("returns the provided fallback port when no tauri invoke transport is available", () => {
    const fallbackPort = createMockRuntimeBridgePort();

    const port = createDesktopRuntimeBridgePort({
      fallbackPort,
      invoke: null,
    });

    expect(port).toBe(fallbackPort);
  });

  it("routes commands through tauri invoke and publishes runtime snapshots", async () => {
    const request = createRuntimeCompileRequest(createEmptySceneDocument(), ["analysis"]);
    let statusSnapshot: RuntimeBridgeStatusSnapshot = {
      status: "idle" as const,
      currentFrame: createRuntimeFramePayload({
        frameNumber: 0,
        entities: [
          {
            entityId: "ball-1",
            position: { x: 132, y: 176 },
            rotation: 0,
          },
        ],
      }),
      currentTimeSeconds: 0,
      timeScale: 1,
      dirtyScopes: [],
      rebuildRequired: false,
      canResume: true,
      blockReason: null,
    };
    const commands: string[] = [];
    const invoke: RuntimeBridgeInvoke = async <T>(
      command: string,
      payload?: Record<string, unknown>,
    ) => {
      commands.push(command);

      if (command === "compile_scene") {
        expect(payload).toEqual({ request });
        return statusSnapshot as T;
      }

      if (command === "set_runtime_time_scale") {
        expect(payload).toEqual({ timeScale: 2 });
        statusSnapshot = {
          ...statusSnapshot,
          timeScale: 2,
        };

        return statusSnapshot as T;
      }

      if (command === "step_runtime") {
        statusSnapshot = {
          ...statusSnapshot,
          currentFrame: createRuntimeFramePayload({
            frameNumber: 1,
            entities: [
              {
                entityId: "ball-1",
                position: { x: 136, y: 172 },
                rotation: 0,
                velocity: { x: 4, y: -4 },
              },
            ],
          }),
          currentTimeSeconds: 1 / 30,
        };

        return statusSnapshot as T;
      }

      if (command === "read_trajectory_samples") {
        expect(payload).toEqual({ analyzerId: "traj-1" });
        return [
          {
            frameNumber: 1,
            timeSeconds: 1 / 60,
            position: { x: 136, y: 172 },
            velocity: { x: 4, y: -4 },
            acceleration: { x: 0, y: -9.81 },
          },
        ] as T;
      }

      throw new Error(`unexpected command: ${command}`);
    };
    const snapshots: RuntimeBridgePortSnapshot[] = [];
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({ fallbackPort, invoke });

    port.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    await port.compile(request);
    await port.setTimeScale(2);
    await port.step();

    expect(port.getSnapshot().lastCompileRequest).toEqual(request);
    expect(port.getSnapshot().bridge.timeScale).toBe(2);
    expect(port.getSnapshot().bridge.currentFrame).toEqual({
      frameNumber: 1,
      entities: [
        {
          id: "ball-1",
          transform: {
            x: 136,
            y: 172,
            rotation: 0,
          },
          velocity: { x: 4, y: -4 },
          acceleration: undefined,
        },
      ],
    });
    await expect(port.readTrajectorySamples("traj-1")).resolves.toEqual([
      {
        frameNumber: 1,
        timeSeconds: 1 / 60,
        position: { x: 136, y: 172 },
        velocity: { x: 4, y: -4 },
        acceleration: { x: 0, y: -9.81 },
      },
    ]);
    expect(commands).not.toContain("runtime_status");
    expect(snapshots).toHaveLength(3);
  });
});
