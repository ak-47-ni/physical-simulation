import { describe, expect, it } from "vitest";

import {
  createEmptySceneDocument,
  createRuntimeFramePayload,
  createUserPolygonEntity,
} from "../../../../packages/scene-schema/src";
import {
  applyRuntimeBridgeStatusSnapshot,
  applyRuntimeFrame,
  createMockRuntimeBridgePort,
  createCompileRequestFromScene,
  createInitialRuntimeBridgeState,
  markRuntimeBridgeRebuilt,
  markRuntimeBridgeSceneDirty,
  pauseRuntimeBridge,
  resetRuntimeBridge,
  resumeRuntimeBridge,
  setRuntimeBridgeErrorMessage,
  setRuntimeBridgeTimeScale,
  stepRuntimeBridge,
  DEFAULT_PRECOMPUTED_DURATION_SECONDS,
  DEFAULT_REALTIME_DURATION_CAP_SECONDS,
  type RuntimeBridgePortSnapshot,
  type RuntimeBridgeStatusSnapshot,
} from "./runtimeBridge";

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

  it("defaults to realtime playback with a fixed 40 second duration cap", () => {
    expect(createInitialRuntimeBridgeState()).toMatchObject({
      status: "idle",
      playbackMode: "realtime",
      totalDurationSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
      preparingProgress: null,
      canSeek: false,
    });
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

  it("applies playback metadata and dirty runtime metadata from bridge status snapshots", () => {
    const state = applyRuntimeBridgeStatusSnapshot(
      createInitialRuntimeBridgeState(),
      createStatusSnapshot({
        status: "preparing",
        dirtyScopes: ["physics", "analysis"],
        rebuildRequired: true,
        canResume: false,
        blockReason: "rebuild-required",
        playbackMode: "precomputed",
        totalDurationSeconds: 24,
        preparingProgress: 0.35,
        canSeek: false,
      }),
    );

    expect(state).toMatchObject({
      status: "preparing",
      currentFrame: null,
      currentTimeSeconds: 0,
      timeScale: 1,
      dirtyScopes: ["physics", "analysis"],
      rebuildRequired: true,
      canResume: false,
      blockReason: "rebuild-required",
      playbackMode: "precomputed",
      totalDurationSeconds: 24,
      preparingProgress: 0.35,
      canSeek: false,
    });
  });

  it("stores runtime command errors and clears them after a successful status snapshot", () => {
    const failed = setRuntimeBridgeErrorMessage(
      createInitialRuntimeBridgeState(),
      "compile failed: unresolved spring endpoint",
    );

    expect(failed.lastErrorMessage).toBe("compile failed: unresolved spring endpoint");

    const recovered = applyRuntimeBridgeStatusSnapshot(
      failed,
      createStatusSnapshot({
        status: "idle",
      }),
    );

    expect(recovered.lastErrorMessage).toBeNull();
    expect(recovered.lastBlockedAction).toBeNull();
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
    expect(blockedResume.lastBlockedAction).toEqual({
      action: "start",
      message: "Rebuild required before starting runtime.",
    });
    expect(blockedResume.lastErrorMessage).toBeNull();

    const rebuilt = markRuntimeBridgeRebuilt(dirty);
    const resumed = resumeRuntimeBridge(rebuilt);

    expect(rebuilt.canResume).toBe(true);
    expect(rebuilt.blockReason).toBe(null);
    expect(rebuilt.lastBlockedAction).toBeNull();
    expect(resumed.status).toBe("running");
  });

  it("tracks time scale, single-step progress, and reset through the bridge state", () => {
    const initial = createInitialRuntimeBridgeState();
    const scaled = setRuntimeBridgeTimeScale(initial, 2);
    const stepped = stepRuntimeBridge(scaled);
    const resumed = resumeRuntimeBridge(stepped);
    const paused = pauseRuntimeBridge(resumed);
    const reset = resetRuntimeBridge(paused);

    expect(initial.currentTimeSeconds).toBe(0);
    expect(scaled.timeScale).toBe(2);
    expect(stepped.currentTimeSeconds).toBeCloseTo(1 / 30, 5);
    expect(resumed.status).toBe("running");
    expect(paused.status).toBe("paused");
    expect(reset).toMatchObject({
      status: "idle",
      currentTimeSeconds: 0,
      timeScale: 1,
      currentFrame: null,
      playbackMode: "realtime",
      totalDurationSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    });
  });

  it("provides a mock runtime bridge port with subscribable command snapshots", async () => {
    const scene = createEmptySceneDocument();
    const request = createCompileRequestFromScene(scene, ["analysis"]);
    const snapshots: RuntimeBridgePortSnapshot[] = [];
    const port = createMockRuntimeBridgePort({
      createFrame: ({ nextFrameNumber }) =>
        createRuntimeFramePayload({
          frameNumber: nextFrameNumber,
          entities: [
            {
              entityId: "probe-1",
              position: { x: nextFrameNumber, y: 2 },
              rotation: 0,
              velocity: { x: 1, y: 0 },
            },
          ],
        }),
    });

    const unsubscribe = port.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    await port.compile(request);
    await port.setTimeScale(0.5);
    await port.start();
    await port.step();
    await port.pause();

    expect(port.getSnapshot().lastCompileRequest).toEqual(request);
    expect(snapshots.at(-1)?.bridge.status).toBe("paused");

    const steppedSnapshot = snapshots.find((snapshot) => snapshot.bridge.currentFrame !== null);

    expect(steppedSnapshot?.bridge.currentTimeSeconds).toBeCloseTo(1 / 120, 5);
    expect(steppedSnapshot?.bridge.currentFrame).toEqual({
      frameNumber: 1,
      entities: [
        {
          id: "probe-1",
          transform: {
            x: 1,
            y: 2,
            rotation: 0,
          },
          velocity: { x: 1, y: 0 },
          acceleration: undefined,
        },
      ],
    });

    const snapshotCountBeforeReset = snapshots.length;

    unsubscribe();
    await port.reset();

    expect(snapshots).toHaveLength(snapshotCountBeforeReset);
    expect(port.getSnapshot().bridge).toMatchObject({
      status: "idle",
      currentTimeSeconds: 0,
      timeScale: 1,
      currentFrame: null,
      playbackMode: "realtime",
      totalDurationSeconds: DEFAULT_REALTIME_DURATION_CAP_SECONDS,
    });
  });

  it("lets the mock runtime bridge port switch playback modes and seek cached time", async () => {
    const port = createMockRuntimeBridgePort({
      createFrame: ({ nextFrameNumber }) =>
        createRuntimeFramePayload({
          frameNumber: nextFrameNumber,
          entities: [
            {
              entityId: "probe-1",
              position: { x: nextFrameNumber, y: 3 },
              rotation: 0,
            },
          ],
        }),
    });

    await port.setPlaybackConfig({
      mode: "precomputed",
      precomputeDurationSeconds: 6,
    });

    expect(port.getSnapshot().bridge).toMatchObject({
      playbackMode: "precomputed",
      totalDurationSeconds: 6,
      canSeek: false,
    });

    await port.start();
    expect(port.getSnapshot().bridge.status).toBe("preparing");
    expect(port.getSnapshot().bridge.preparingProgress).toBe(0);

    for (let index = 0; index < 10 && !port.getSnapshot().bridge.canSeek; index += 1) {
      await port.tick();
    }

    expect(port.getSnapshot().bridge).toMatchObject({
      status: "running",
      playbackMode: "precomputed",
      totalDurationSeconds: 6,
      canSeek: true,
    });

    const soughtSnapshot = await port.seek(4);

    expect(soughtSnapshot.bridge.currentTimeSeconds).toBeCloseTo(4, 5);
    expect(soughtSnapshot.bridge.currentFrame).toEqual({
      frameNumber: 240,
      entities: [
        {
          id: "probe-1",
          transform: {
            x: 240,
            y: 3,
            rotation: 0,
          },
          velocity: undefined,
          acceleration: undefined,
        },
      ],
    });
  });

  it("ticks the mock runtime bridge port only while running and preserves the compile request", async () => {
    const scene = createEmptySceneDocument();
    const request = createCompileRequestFromScene(scene, ["analysis"]);
    const port = createMockRuntimeBridgePort({
      createFrame: ({ nextFrameNumber }) =>
        createRuntimeFramePayload({
          frameNumber: nextFrameNumber,
          entities: [
            {
              entityId: "probe-1",
              position: { x: nextFrameNumber * 2, y: 4 },
              rotation: 0,
              velocity: { x: 2, y: 0 },
            },
          ],
        }),
    });

    await port.compile(request);

    const idleTick = await port.tick();
    expect(idleTick.bridge.currentFrame).toBeNull();
    expect(idleTick.bridge.currentTimeSeconds).toBe(0);
    expect(idleTick.lastCompileRequest).toEqual(request);

    await port.start();
    const runningTick = await port.tick();

    expect(runningTick.bridge.status).toBe("running");
    expect(runningTick.bridge.currentTimeSeconds).toBeCloseTo(1 / 60, 5);
    expect(runningTick.bridge.currentFrame).toEqual({
      frameNumber: 1,
      entities: [
        {
          id: "probe-1",
          transform: {
            x: 2,
            y: 4,
            rotation: 0,
          },
          velocity: { x: 2, y: 0 },
          acceleration: undefined,
        },
      ],
    });
    expect(runningTick.lastCompileRequest).toEqual(request);
  });

  it("reads mock trajectory samples by analyzer id and clears them on reset", async () => {
    const scene = createEmptySceneDocument();
    const request = createCompileRequestFromScene(scene, ["analysis"]);
    const port = createMockRuntimeBridgePort({
      createFrame: ({ nextFrameNumber }) =>
        createRuntimeFramePayload({
          frameNumber: nextFrameNumber,
          entities: [
            {
              entityId: "probe-1",
              position: { x: nextFrameNumber, y: 2 },
              rotation: 0,
              velocity: { x: 1.5, y: -0.5 * nextFrameNumber },
              acceleration: { x: 0, y: -9.81 },
            },
          ],
        }),
      createTrajectorySamples: ({ bridge, currentSamplesByAnalyzer }) => ({
        "traj-1": [
          ...(currentSamplesByAnalyzer["traj-1"] ?? []),
          {
            frameNumber: bridge.currentFrame?.frameNumber ?? 0,
            timeSeconds: bridge.currentTimeSeconds,
            position: {
              x: bridge.currentFrame?.entities[0]?.transform.x ?? 0,
              y: bridge.currentFrame?.entities[0]?.transform.y ?? 0,
            },
            velocity: bridge.currentFrame?.entities[0]?.velocity ?? { x: 0, y: 0 },
            acceleration: bridge.currentFrame?.entities[0]?.acceleration ?? { x: 0, y: 0 },
          },
        ],
      }),
    });

    await port.compile(request);
    await port.step();
    await port.step();

    await expect(port.readTrajectorySamples("traj-1")).resolves.toEqual([
      {
        frameNumber: 1,
        timeSeconds: 1 / 60,
        position: { x: 1, y: 2 },
        velocity: { x: 1.5, y: -0.5 },
        acceleration: { x: 0, y: -9.81 },
      },
      {
        frameNumber: 2,
        timeSeconds: 2 / 60,
        position: { x: 2, y: 2 },
        velocity: { x: 1.5, y: -1 },
        acceleration: { x: 0, y: -9.81 },
      },
    ]);
    await expect(port.readTrajectorySamples("missing-analyzer")).rejects.toThrow(
      /unknown analyzer/i,
    );

    await port.reset();

    await expect(port.readTrajectorySamples("traj-1")).rejects.toThrow(/unknown analyzer/i);
  });

  it("uses the documented default precomputed duration when the caller omits one", async () => {
    const port = createMockRuntimeBridgePort();

    await port.setPlaybackConfig({
      mode: "precomputed",
    });

    expect(port.getSnapshot().bridge.totalDurationSeconds).toBe(
      DEFAULT_PRECOMPUTED_DURATION_SECONDS,
    );
  });
});
