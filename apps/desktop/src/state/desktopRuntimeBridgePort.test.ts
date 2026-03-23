import { describe, expect, it } from "vitest";

import {
  createEmptySceneDocument,
  createRuntimeFramePayload,
} from "../../../../packages/scene-schema/src";
import {
  createMockRuntimeBridgePort,
  createRuntimeCompileRequest,
  DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  type RuntimeBridgePortSnapshot,
  type RuntimeBridgeStatusSnapshot,
} from "./runtimeBridge";
import {
  createDesktopRuntimeBridgePort,
  type RuntimeBridgeInvoke,
} from "./desktopRuntimeBridgePort";

function createStatusSnapshot(
  overrides: Partial<RuntimeBridgeStatusSnapshot> = {},
): RuntimeBridgeStatusSnapshot {
  return {
    status: "idle",
    currentFrame: null,
    currentTimeSeconds: 0,
    timeScale: 1,
    dirtyScopes: [],
    rebuildRequired: false,
    canResume: true,
    blockReason: null,
    playbackMode: "realtime",
    totalDurationSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    preparingProgress: null,
    canSeek: false,
    ...overrides,
  };
}

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
    let statusSnapshot = createStatusSnapshot({
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
    });
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
        statusSnapshot = createStatusSnapshot({
          ...statusSnapshot,
          currentFrame: statusSnapshot.currentFrame,
          timeScale: 2,
        });

        return statusSnapshot as T;
      }

      if (command === "step_runtime") {
        statusSnapshot = createStatusSnapshot({
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
          timeScale: 2,
        });

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

  it("routes playback-config updates and seek commands through tauri invoke", async () => {
    let statusSnapshot = createStatusSnapshot();
    const commands: string[] = [];
    const invoke: RuntimeBridgeInvoke = async <T>(
      command: string,
      payload?: Record<string, unknown>,
    ) => {
      commands.push(command);

      if (command === "set_runtime_playback_config") {
        expect(payload).toEqual({
          config: {
            mode: "precomputed",
            precomputeDurationSeconds: 12,
          },
        });

        statusSnapshot = createStatusSnapshot({
          playbackMode: "precomputed",
          totalDurationSeconds: 12,
          canSeek: false,
        });

        return statusSnapshot as T;
      }

      if (command === "seek_runtime") {
        expect(payload).toEqual({ timeSeconds: 4 });

        statusSnapshot = createStatusSnapshot({
          ...statusSnapshot,
          status: "paused",
          currentTimeSeconds: 4,
          playbackMode: "precomputed",
          totalDurationSeconds: 12,
          canSeek: true,
          currentFrame: createRuntimeFramePayload({
            frameNumber: 240,
            entities: [
              {
                entityId: "ball-1",
                position: { x: 240, y: 160 },
                rotation: 0,
              },
            ],
          }),
        });

        return statusSnapshot as T;
      }

      throw new Error(`unexpected command: ${command}`);
    };
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({ fallbackPort, invoke });

    await port.setPlaybackConfig({
      mode: "precomputed",
      precomputeDurationSeconds: 12,
    });
    const snapshot = await port.seek(4);

    expect(snapshot.bridge).toMatchObject({
      playbackMode: "precomputed",
      totalDurationSeconds: 12,
      currentTimeSeconds: 4,
      canSeek: true,
    });
    expect(snapshot.bridge.currentFrame).toEqual({
      frameNumber: 240,
      entities: [
        {
          id: "ball-1",
          transform: {
            x: 240,
            y: 160,
            rotation: 0,
          },
          velocity: undefined,
          acceleration: undefined,
        },
      ],
    });
    expect(commands).toEqual(["set_runtime_playback_config", "seek_runtime"]);
  });

  it("preserves backend command failures on the runtime snapshot", async () => {
    const request = createRuntimeCompileRequest(createEmptySceneDocument(), ["analysis"]);
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({
      fallbackPort,
      invoke: async () => {
        throw new Error("compile failed: spring endpoint missing");
      },
    });

    await expect(port.compile(request)).rejects.toThrow("compile failed: spring endpoint missing");
    expect(port.getSnapshot().bridge.lastErrorMessage).toBe(
      "compile failed: spring endpoint missing",
    );
    expect(port.getSnapshot().bridge.lastBlockedAction).toBeNull();
  });

  it("routes playback ticks through tauri invoke and preserves the last compile request", async () => {
    const request = createRuntimeCompileRequest(createEmptySceneDocument(), ["analysis"]);
    let statusSnapshot = createStatusSnapshot({
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
    });
    const commands: string[] = [];
    const invoke: RuntimeBridgeInvoke = async <T>(command: string) => {
      commands.push(command);

      if (command === "compile_scene") {
        return statusSnapshot as T;
      }

      if (command === "start_runtime") {
        statusSnapshot = createStatusSnapshot({
          ...statusSnapshot,
          status: "running",
          currentFrame: statusSnapshot.currentFrame,
        });

        return statusSnapshot as T;
      }

      if (command === "tick_runtime") {
        statusSnapshot = createStatusSnapshot({
          ...statusSnapshot,
          status: "running",
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
          currentTimeSeconds: 1 / 60,
        });

        return statusSnapshot as T;
      }

      throw new Error(`unexpected command: ${command}`);
    };
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({ fallbackPort, invoke });

    await port.compile(request);
    await port.start();
    const snapshot = await port.tick();

    expect(snapshot.lastCompileRequest).toEqual(request);
    expect(snapshot.bridge.status).toBe("running");
    expect(snapshot.bridge.currentTimeSeconds).toBeCloseTo(1 / 60, 5);
    expect(snapshot.bridge.currentFrame).toEqual({
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
    expect(commands).toEqual(["compile_scene", "start_runtime", "tick_runtime"]);
  });

  it("publishes readable runtime failures for seek commands", async () => {
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({
      fallbackPort,
      invoke: async <T>(command: string) => {
        if (command === "set_runtime_playback_config") {
          return createStatusSnapshot({
            playbackMode: "precomputed",
            totalDurationSeconds: 8,
          }) as T;
        }

        if (command === "seek_runtime") {
          throw "seek failed: cached playback is not ready";
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });

    await port.setPlaybackConfig({
      mode: "precomputed",
      precomputeDurationSeconds: 8,
    });

    await expect(port.seek(4)).rejects.toThrow("seek failed: cached playback is not ready");
    expect(port.getSnapshot().bridge.lastErrorMessage).toBe(
      "seek failed: cached playback is not ready",
    );
    expect(port.getSnapshot().bridge.lastBlockedAction).toBeNull();
  });
});
