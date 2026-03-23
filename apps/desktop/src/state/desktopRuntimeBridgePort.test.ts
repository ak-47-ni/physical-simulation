import { describe, expect, it, vi } from "vitest";

import { createEmptySceneDocument } from "../../../../packages/scene-schema/src";
import {
  createMockRuntimeBridgePort,
  createRuntimeCompileRequest,
} from "./runtimeBridge";
import { createDesktopRuntimeBridgePort } from "./desktopRuntimeBridgePort";

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
    let statusSnapshot = {
      status: "idle" as const,
      currentFrame: {
        frameNumber: 0,
        entities: [
          {
            entityId: "ball-1",
            position: { x: 132, y: 176 },
            rotation: 0,
          },
        ],
      },
      currentTimeSeconds: 0,
      timeScale: 1,
      dirtyScopes: [],
      rebuildRequired: false,
      canResume: true,
      blockReason: null,
    };
    const invoke = vi.fn(async (command: string, payload?: Record<string, unknown>) => {
      if (command === "compile_scene") {
        expect(payload).toEqual({ request });
        return statusSnapshot;
      }

      if (command === "set_runtime_time_scale") {
        expect(payload).toEqual({ timeScale: 2 });
        statusSnapshot = {
          ...statusSnapshot,
          timeScale: 2,
        };

        return statusSnapshot;
      }

      if (command === "step_runtime") {
        statusSnapshot = {
          ...statusSnapshot,
          currentFrame: {
            frameNumber: 1,
            entities: [
              {
                entityId: "ball-1",
                position: { x: 136, y: 172 },
                rotation: 0,
                velocity: { x: 4, y: -4 },
              },
            ],
          },
          currentTimeSeconds: 1 / 30,
        };

        return statusSnapshot;
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
        ];
      }

      throw new Error(`unexpected command: ${command}`);
    });
    const snapshots = [];
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
    expect(invoke.mock.calls.map(([command]) => command)).not.toContain("runtime_status");
    expect(snapshots).toHaveLength(3);
  });
});
