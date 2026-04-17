import { describe, expect, it } from "vitest";

import {
  createEmptySceneDocument,
  createRuntimeFramePayload,
} from "../../../../packages/scene-schema/src";
import {
  createMockRuntimeBridgePort,
  createRuntimeCompileRequest,
  DEFAULT_PRECOMPUTED_DURATION_SECONDS,
  DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  type RuntimeTrajectorySample,
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
    playbackMode: "precomputed",
    totalDurationSeconds: DEFAULT_PRECOMPUTED_DURATION_SECONDS,
    preparingProgress: null,
    canSeek: false,
    resultState: "uncomputed",
    ...overrides,
  };
}

function createElasticBounceRequest(boardFriction: number) {
  const scene = createEmptySceneDocument();
  scene.entities.push(
    {
      id: "ball-1",
      kind: "ball",
      x: 1.32,
      y: 1.12,
      radius: 0.24,
      mass: 1,
      friction: 0,
      restitution: 1,
      locked: false,
      velocityX: 0,
      velocityY: 0,
    },
    {
      id: "board-1",
      kind: "board",
      x: 2.4,
      y: 3.12,
      width: 1.6,
      height: 0.18,
      rotationDegrees: 0,
      mass: 5,
      friction: boardFriction,
      restitution: 1,
      locked: true,
      velocityX: 0,
      velocityY: 0,
    },
  );
  scene.analyzers.push({
    id: "traj-1",
    kind: "trajectory",
    entityId: "ball-1",
  });

  return createRuntimeCompileRequest(scene, ["physics", "analysis"]);
}

function createRotatedBlockLocalTangentHandoffRequest() {
  const scene = createEmptySceneDocument();
  scene.entities.push(
    {
      id: "ball-1",
      kind: "ball",
      x: 1.96,
      y: 1.56,
      radius: 0.24,
      mass: 1.2,
      friction: 0,
      restitution: 1,
      locked: false,
      velocityX: 1.1,
      velocityY: 0,
    },
    {
      id: "block-1",
      kind: "block",
      x: 2.48,
      y: 2.04,
      width: 0.84,
      height: 0.52,
      rotationDegrees: 15,
      mass: 2.8,
      friction: 0,
      restitution: 1,
      locked: false,
      velocityX: 0,
      velocityY: 0,
    },
    {
      id: "arc-track-1",
      kind: "arc-track",
      label: "Arc Track 1",
      anchorEntityId: "block-1",
      anchorEntityKind: "block",
      anchorEndpoint: "start",
      center: { x: 2.48, y: 3.04 },
      entryEndpoint: "start",
      side: "inside",
      physicsMode: "hybrid-rail-body",
      radius: 1,
      rotationDegrees: 135,
      sweepAngleDegrees: 90,
      thickness: 0.18,
    },
  );

  return createRuntimeCompileRequest(scene, ["physics"]);
}

const FIFTEEN_DEGREES_IN_RADIANS = (15 * Math.PI) / 180;

function readReboundPeakHeights(samples: RuntimeTrajectorySample[]) {
  const peaks: number[] = [];

  for (let index = 1; index < samples.length - 1; index += 1) {
    const previousY = samples[index - 1].position.y;
    const currentY = samples[index].position.y;
    const nextY = samples[index + 1].position.y;

    if (currentY < previousY && currentY < nextY) {
      peaks.push(currentY);
    }
  }

  return peaks;
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
          resultState: "ready",
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
      resultState: "ready",
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

  it("passes anchored arc-track compile requests through tauri invoke without legacy fields", async () => {
    const scene = createEmptySceneDocument();
    scene.entities.push(
      {
        id: "board-1",
        kind: "board",
        x: 3.18,
        y: 2.72,
        width: 1.2,
        height: 0.18,
        rotationDegrees: 0,
        mass: 5,
        friction: 0.42,
        restitution: 1,
        locked: true,
        velocityX: 0,
        velocityY: 0,
      },
      {
        id: "arc-track-1",
        kind: "arc-track",
        label: "Arc Track 1",
        anchorEntityId: "board-1",
        anchorEntityKind: "board",
        anchorEndpoint: "start",
        center: { x: 3.18, y: 3.72 },
        entryEndpoint: "start",
        radius: 1,
        rotationDegrees: 135,
        sweepAngleDegrees: 90,
        thickness: 0.18,
      },
    );
    const request = createRuntimeCompileRequest(scene, ["physics"]);
    const commands: string[] = [];
    const port = createDesktopRuntimeBridgePort({
      fallbackPort: createMockRuntimeBridgePort(),
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        commands.push(command);

        if (command === "compile_scene") {
          expect(payload).toEqual({ request });
          return createStatusSnapshot({
            playbackMode: "precomputed",
            resultState: "stale",
            canSeek: false,
            rebuildRequired: true,
            blockReason: "rebuild-required",
          }) as T;
        }

        if (command === "start_runtime") {
          return createStatusSnapshot({
            status: "running",
            playbackMode: "precomputed",
            resultState: "calculating",
          }) as T;
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });

    await port.compile(request);
    await port.start();

    const arcTrackEntity = port
      .getSnapshot()
      .lastCompileRequest?.scene.entities.find(
        (entity): entity is {
          id: string;
          kind: string;
          anchorEntityId: string;
          anchorEntityKind: string;
          anchorEndpoint: string;
          center: { x: number; y: number };
          entryEndpoint: string;
          side: string;
          physicsMode: string;
          radius: number;
          rotationDegrees: number;
          sweepAngleDegrees: number;
          thickness: number;
        } => entity.id === "arc-track-1",
      );

    expect(commands).toEqual(["compile_scene", "start_runtime"]);
    expect(arcTrackEntity).toMatchObject({
      id: "arc-track-1",
      kind: "arc-track",
      anchorEntityId: "board-1",
      anchorEntityKind: "board",
      anchorEndpoint: "start",
      center: { x: 3.18, y: 3.72 },
      entryEndpoint: "start",
      side: "inside",
      physicsMode: "hybrid-rail-body",
      radius: 1,
      rotationDegrees: 135,
      sweepAngleDegrees: 90,
      thickness: 0.18,
    });
    expect(arcTrackEntity).not.toHaveProperty("centralAngleDegrees");
  });

  it("preserves rotated block local-junction metadata when compile requests go through tauri invoke", async () => {
    const request = createRotatedBlockLocalTangentHandoffRequest();
    const commands: string[] = [];
    const port = createDesktopRuntimeBridgePort({
      fallbackPort: createMockRuntimeBridgePort(),
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        commands.push(command);

        if (command === "compile_scene") {
          expect(payload).toEqual({ request });
          return createStatusSnapshot({
            playbackMode: "precomputed",
            resultState: "stale",
            canSeek: false,
            rebuildRequired: true,
            blockReason: "rebuild-required",
          }) as T;
        }

        if (command === "start_runtime") {
          return createStatusSnapshot({
            status: "running",
            playbackMode: "precomputed",
            resultState: "calculating",
          }) as T;
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });

    await port.compile(request);
    await port.start();

    const ballEntity = port
      .getSnapshot()
      .lastCompileRequest?.scene.entities.find((entity) => entity.id === "ball-1");
    const blockEntity = port
      .getSnapshot()
      .lastCompileRequest?.scene.entities.find(
        (entity): entity is {
          id: string;
          kind: string;
          rotationRadians: number;
        } => entity.id === "block-1",
      );
    const arcTrackEntity = port
      .getSnapshot()
      .lastCompileRequest?.scene.entities.find(
        (entity): entity is {
          id: string;
          kind: string;
          anchorEntityId: string;
          anchorEntityKind: string;
          anchorEndpoint: string;
          center: { x: number; y: number };
          entryEndpoint: string;
          side: string;
          physicsMode: string;
          radius: number;
          rotationDegrees: number;
          sweepAngleDegrees: number;
          thickness: number;
        } => entity.id === "arc-track-1",
      );

    expect(commands).toEqual(["compile_scene", "start_runtime"]);
    expect(ballEntity).toMatchObject({
      id: "ball-1",
      kind: "ball",
      velocityX: 1.1,
      velocityY: 0,
    });
    expect(blockEntity).toMatchObject({
      id: "block-1",
      kind: "block",
    });
    expect(blockEntity?.rotationRadians).toBeCloseTo(FIFTEEN_DEGREES_IN_RADIANS, 6);
    expect(arcTrackEntity).toMatchObject({
      id: "arc-track-1",
      kind: "arc-track",
      anchorEntityId: "block-1",
      anchorEntityKind: "block",
      anchorEndpoint: "start",
      center: { x: 2.48, y: 3.04 },
      entryEndpoint: "start",
      side: "inside",
      physicsMode: "hybrid-rail-body",
      radius: 1,
      rotationDegrees: 135,
      sweepAngleDegrees: 90,
      thickness: 0.18,
    });
    expect(arcTrackEntity).not.toHaveProperty("centralAngleDegrees");
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

  it("preserves explicit result validity states from backend status snapshots", async () => {
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({
      fallbackPort,
      invoke: async <T>(command: string) => {
        if (command === "compile_scene") {
          return createStatusSnapshot({
            resultState: "stale",
            rebuildRequired: true,
            canResume: false,
            blockReason: "rebuild-required",
          }) as T;
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });

    await port.compile(createRuntimeCompileRequest(createEmptySceneDocument(), ["physics"]));

    expect(port.getSnapshot().bridge.resultState).toBe("stale");
    expect(port.getSnapshot().bridge.rebuildRequired).toBe(true);
    expect(port.getSnapshot().bridge.canSeek).toBe(false);
  });

  it("publishes backend guide attachment metadata through tauri status snapshots", async () => {
    const request = createRotatedBlockLocalTangentHandoffRequest();
    const commands: string[] = [];
    const fallbackPort = createMockRuntimeBridgePort();
    const port = createDesktopRuntimeBridgePort({
      fallbackPort,
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        commands.push(command);

        if (command === "compile_scene") {
          expect(payload).toEqual({ request });
          return createStatusSnapshot({
            currentFrame: createRuntimeFramePayload({
              frameNumber: 0,
              entities: [
                {
                  entityId: "ball-1",
                  position: { x: 1.96, y: 1.56 },
                  rotation: 0,
                },
              ],
            }),
            guideStates: [
              {
                entityId: "ball-1",
                guideState: "attached",
                guideSegmentId: "guide:block-1:top",
                guideProgress: 0.6,
                guideSpeed: 1.1,
              },
            ],
          }) as T;
        }

        if (command === "step_runtime") {
          return createStatusSnapshot({
            currentFrame: createRuntimeFramePayload({
              frameNumber: 1,
              entities: [
                {
                  entityId: "ball-1",
                  position: { x: 2.48, y: 3.04 },
                  rotation: 0,
                },
              ],
            }),
            currentTimeSeconds: 1 / 60,
            guideStates: [
              {
                entityId: "ball-1",
                guideState: "attached",
                guideSegmentId: "guide:arc-track-1:arc",
                guideProgress: 0.12,
                guideSpeed: -1.1,
              },
            ],
          }) as T;
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });

    await port.compile(request);

    expect(port.getSnapshot().bridge.guideStates).toEqual({
      "ball-1": {
        guideState: "attached",
        guideSegmentId: "guide:block-1:top",
        guideProgress: 0.6,
        guideSpeed: 1.1,
      },
    });

    await port.step();

    expect(commands).toEqual(["compile_scene", "step_runtime"]);
    expect(port.getSnapshot().bridge.guideStates).toEqual({
      "ball-1": {
        guideState: "attached",
        guideSegmentId: "guide:arc-track-1:arc",
        guideProgress: 0.12,
        guideSpeed: -1.1,
      },
    });
  });

  it("preserves backend rebound peaks across friction-only recompiles", async () => {
    const lowFrictionRequest = createElasticBounceRequest(0);
    const highFrictionRequest = createElasticBounceRequest(0.9);
    let activeFriction = 0;
    const samplesByFriction: Record<number, RuntimeTrajectorySample[]> = {
      0: [
        {
          frameNumber: 10,
          timeSeconds: 0.16,
          position: { x: 1.56, y: 2.78 },
          velocity: { x: 0, y: 6.2 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 18,
          timeSeconds: 0.3,
          position: { x: 1.56, y: 1.14 },
          velocity: { x: 0, y: -6.1 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 26,
          timeSeconds: 0.43,
          position: { x: 1.56, y: 2.8 },
          velocity: { x: 0, y: 6.15 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 34,
          timeSeconds: 0.57,
          position: { x: 1.56, y: 1.15 },
          velocity: { x: 0, y: -6.05 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 42,
          timeSeconds: 0.7,
          position: { x: 1.56, y: 2.81 },
          velocity: { x: 0, y: 6.1 },
          acceleration: { x: 0, y: 9.8 },
        },
      ],
      0.9: [
        {
          frameNumber: 10,
          timeSeconds: 0.16,
          position: { x: 1.56, y: 2.78 },
          velocity: { x: 0, y: 6.2 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 18,
          timeSeconds: 0.3,
          position: { x: 1.56, y: 1.14 },
          velocity: { x: 0.4, y: -6.1 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 26,
          timeSeconds: 0.43,
          position: { x: 1.61, y: 2.8 },
          velocity: { x: 0.35, y: 6.15 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 34,
          timeSeconds: 0.57,
          position: { x: 1.66, y: 1.15 },
          velocity: { x: 0.3, y: -6.05 },
          acceleration: { x: 0, y: 9.8 },
        },
        {
          frameNumber: 42,
          timeSeconds: 0.7,
          position: { x: 1.7, y: 2.81 },
          velocity: { x: 0.25, y: 6.1 },
          acceleration: { x: 0, y: 9.8 },
        },
      ],
    };
    const port = createDesktopRuntimeBridgePort({
      fallbackPort: createMockRuntimeBridgePort(),
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        if (command === "compile_scene") {
          const request = payload as {
            request: {
              scene: {
                entities: Array<{ kind: string; friction?: number }>;
              };
            };
          };
          activeFriction =
            request.request.scene.entities.find((entity) => entity.kind === "board")?.friction ?? 0;

          return createStatusSnapshot({
            status: "paused",
            playbackMode: "precomputed",
            canSeek: true,
            resultState: "ready",
          }) as T;
        }

        if (command === "read_trajectory_samples") {
          expect(payload).toEqual({ analyzerId: "traj-1" });
          return samplesByFriction[activeFriction] as T;
        }

        throw new Error(`unexpected command: ${command}`);
      },
    });

    await port.compile(lowFrictionRequest);
    const lowFrictionSamples = await port.readTrajectorySamples("traj-1");
    await port.compile(highFrictionRequest);
    const highFrictionSamples = await port.readTrajectorySamples("traj-1");

    const lowFrictionPeaks = readReboundPeakHeights(lowFrictionSamples);
    const highFrictionPeaks = readReboundPeakHeights(highFrictionSamples);

    expect(lowFrictionPeaks).toEqual([1.14, 1.15]);
    expect(highFrictionPeaks).toEqual([1.14, 1.15]);
    expect(Math.abs(lowFrictionPeaks[0] - lowFrictionPeaks[1])).toBeLessThanOrEqual(0.02);
    expect(Math.abs(highFrictionPeaks[0] - highFrictionPeaks[1])).toBeLessThanOrEqual(0.02);
  });
});
