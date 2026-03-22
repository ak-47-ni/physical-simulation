import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createEmptySceneDocument } from "../../../../packages/scene-schema/src";
import {
  createCompileRequestFromScene,
  createMockRuntimeBridgePort,
  type RuntimeBridgePort,
} from "../state/runtimeBridge";
import { useRuntimeTrajectorySamples } from "./useRuntimeTrajectorySamples";

afterEach(() => {
  cleanup();
});

function RuntimeTrajectoryProbe(props: {
  runtimePort?: RuntimeBridgePort;
  analyzerId?: string;
}) {
  const { error, status, trajectorySamples } = useRuntimeTrajectorySamples(props);

  return (
    <div>
      <span data-testid="trajectory-status">{status}</span>
      <span data-testid="trajectory-count">{trajectorySamples.length}</span>
      <span data-testid="trajectory-error">{error ?? ""}</span>
    </div>
  );
}

describe("useRuntimeTrajectorySamples", () => {
  it("stays idle when no runtime source is provided", () => {
    render(<RuntimeTrajectoryProbe />);

    expect(screen.getByTestId("trajectory-status").textContent).toBe("idle");
    expect(screen.getByTestId("trajectory-count").textContent).toBe("0");
    expect(screen.getByTestId("trajectory-error").textContent).toBe("");
  });

  it("subscribes to runtime port updates and loads analyzer samples", async () => {
    const port = createMockRuntimeBridgePort({
      createFrame: ({ nextFrameNumber }) => ({
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
    const request = createCompileRequestFromScene(createEmptySceneDocument(), ["analysis"]);

    render(<RuntimeTrajectoryProbe runtimePort={port} analyzerId="traj-1" />);

    await port.compile(request);
    await port.step();
    await port.step();

    await waitFor(() => {
      expect(screen.getByTestId("trajectory-status").textContent).toBe("ready");
      expect(screen.getByTestId("trajectory-count").textContent).toBe("2");
      expect(screen.getByTestId("trajectory-error").textContent).toBe("");
    });
  });
});
