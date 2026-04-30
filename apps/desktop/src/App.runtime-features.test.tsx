import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceCanvasSpy = vi.hoisted(() => ({
  latestProps: null as null | Record<string, unknown>,
}));

type QueuedAnimationFrame = {
  callback: FrameRequestCallback;
  cancelled: boolean;
  handle: number;
  ran: boolean;
};

function createControlledAnimationFrame() {
  let nextHandle = 1;
  const queuedFrames: QueuedAnimationFrame[] = [];

  vi.stubGlobal(
    "requestAnimationFrame",
    ((callback: FrameRequestCallback) => {
      const frame: QueuedAnimationFrame = {
        callback,
        cancelled: false,
        handle: nextHandle,
        ran: false,
      };

      nextHandle += 1;
      queuedFrames.push(frame);

      return frame.handle;
    }) as typeof requestAnimationFrame,
  );

  vi.stubGlobal(
    "cancelAnimationFrame",
    ((handle: number) => {
      const frame = queuedFrames.find(
        (candidate) => candidate.handle === handle && candidate.ran === false,
      );

      if (frame) {
        frame.cancelled = true;
      }
    }) as typeof cancelAnimationFrame,
  );

  return {
    pendingCount() {
      return queuedFrames.filter((frame) => frame.ran === false && frame.cancelled === false)
        .length;
    },
    runNext(timestamp: number, options: { includeCancelled?: boolean } = {}) {
      const frame = queuedFrames.find(
        (candidate) =>
          candidate.ran === false && (options.includeCancelled === true || !candidate.cancelled),
      );

      if (!frame) {
        throw new Error("No queued animation frame available.");
      }

      frame.ran = true;
      frame.callback(timestamp);
      return frame.handle;
    },
  };
}

async function flushMicrotasks(iterations = 80) {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    await Promise.resolve();
  }
}

vi.mock("./workspace/WorkspaceCanvas", async () => {
  const actual = await vi.importActual<typeof import("./workspace/WorkspaceCanvas")>(
    "./workspace/WorkspaceCanvas",
  );

  return {
    ...actual,
    WorkspaceCanvas: (props: Parameters<typeof actual.WorkspaceCanvas>[0]) => {
      workspaceCanvasSpy.latestProps = props as Record<string, unknown>;

      return actual.WorkspaceCanvas(props);
    },
  };
});

import { App } from "./App";

beforeEach(() => {
  workspaceCanvasSpy.latestProps = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function getTransportHarness() {
  const transport = within(screen.getByTestId("bottom-transport-bar"));
  const topRow = within(screen.getByTestId("transport-compact-row"));

  return { topRow, transport };
}

async function calculateResult(durationSeconds = 1) {
  const { transport } = getTransportHarness();

  fireEvent.change(screen.getByLabelText("Precompute duration"), {
    target: { value: String(durationSeconds) },
  });
  fireEvent.click(transport.getByRole("button", { name: /^calculate$/i }));

  await waitFor(() => {
    expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
      false,
    );
  }, { timeout: 5_000 });

  return getTransportHarness();
}

async function rewindCalculatedResult() {
  const { transport, topRow } = getTransportHarness();

  fireEvent.click(transport.getByRole("button", { name: /^reset$/i }));

  await waitFor(() => {
    expect(topRow.getByText("0.00 s")).toBeDefined();
  });

  return getTransportHarness();
}

describe("App runtime features", () => {
  it("mounts scene physics controls with SI defaults and classroom world scale", () => {
    render(<App />);

    expect((screen.getByLabelText("Gravity") as HTMLInputElement).value).toBe("9.8");
    expect(screen.getByText("m/s²")).toBeDefined();
    expect((screen.getByLabelText("Length unit") as HTMLSelectElement).value).toBe("m");
    expect((screen.getByLabelText("Velocity unit") as HTMLSelectElement).value).toBe("m/s");
    expect((screen.getByLabelText("Mass unit") as HTMLSelectElement).value).toBe("kg");
    expect((screen.getByLabelText("Pixels per meter") as HTMLInputElement).value).toBe("100");
  });

  it("mounts the transport bar, analysis panel, and annotation layer into the desktop shell", () => {
    render(<App />);

    expect(screen.getByTestId("bottom-transport-bar")).toBeDefined();
    expect(screen.getByTestId("analysis-panel")).toBeDefined();
    expect(screen.getByTestId("annotation-layer")).toBeDefined();
  });

  it("routes transport controls through app runtime state", async () => {
    render(<App />);
    const { topRow } = getTransportHarness();

    expect(screen.getByText("0.00 s")).toBeDefined();

    fireEvent.change(topRow.getByRole("combobox", { name: /speed/i }), {
      target: { value: "2" },
    });
    expect((topRow.getByRole("combobox", { name: /speed/i }) as HTMLSelectElement).value).toBe(
      "2",
    );

    let harness = await calculateResult();
    harness = await rewindCalculatedResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect(screen.getByText("0.02 s")).toBeDefined();
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));
    harness = getTransportHarness();
    await waitFor(() => {
      expect(harness.topRow.queryByText("0.02 s")).toBeNull();
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));
    expect((harness.topRow.getByRole("combobox", { name: /speed/i }) as HTMLSelectElement).value).toBe(
      "1",
    );

    fireEvent.click(harness.transport.getByRole("button", { name: /^reset$/i }));
    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
    });
    expect((harness.topRow.getByRole("combobox", { name: /speed/i }) as HTMLSelectElement).value).toBe(
      "1",
    );
  });

  it("syncs analysis overlay toggles back into app display state", () => {
    render(<App />);

    expect((screen.getByLabelText("Show trajectories") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /show trajectories/i }));

    expect((screen.getByLabelText("Show trajectories") as HTMLInputElement).checked).toBe(true);
  });

  it("syncs annotation visibility through app state", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /hide annotations/i }));

    expect(screen.getByTestId("annotation-layer").getAttribute("data-visible")).toBe("false");
  });

  it("shows runtime analysis guidance before samples and updates the summary after stepping", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Tracked entity: ball-1")).toBeDefined();
      expect(screen.getByText("Runtime sample count: 0")).toBeDefined();
      expect(
        screen.getByText("No runtime samples yet. Calculate playback to collect data."),
      ).toBeDefined();
    });

    await calculateResult();

    await waitFor(() => {
      expect(screen.getByText("Tracked entity: ball-1")).toBeDefined();
      expect(screen.getByText(/Runtime sample count: [1-9]\d*/)).toBeDefined();
    });
  });

  it("projects runtime step positions back into the workspace", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("132px");

    let harness = await calculateResult();
    harness = await rewindCalculatedResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
    });
  });

  it("falls back to authored workspace positions after resetting the runtime", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });
    let harness = await calculateResult();
    harness = await rewindCalculatedResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("132px");
    });
  });

  it("continues advancing workspace positions after starting runtime", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    expect(ball.style.left).toBe("132px");

    const harness = await calculateResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    const firstRunningPosition = ball.style.left;

    await waitFor(() => {
      expect(ball.style.left).not.toBe(firstRunningPosition);
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));
  });

  it("freezes the visible runtime position after pausing playback", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    const harness = await calculateResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));

    const pausedPosition = ball.style.left;

    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 80);
    });

    expect(ball.style.left).toBe(pausedPosition);
  });

  it("restores the authored workspace position after resetting from playback", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    const harness = await calculateResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^reset$/i }));

    await waitFor(() => {
      expect(ball.style.left).toBe("132px");
      expect(ball.style.top).toBe("176px");
    });
  });

  it("recompiles from frame zero after changing gravity while paused", async () => {
    render(<App />);
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    let harness = await calculateResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));

    await waitFor(() => {
      expect(ball.style.top).not.toBe("176px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));

    const pausedTop = ball.style.top;

    expect(pausedTop).not.toBe("176px");

    fireEvent.change(screen.getByLabelText("Gravity"), { target: { value: "12.5" } });

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect(ball.style.left).toBe("132px");
      expect(ball.style.top).toBe("176px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^calculate$/i }));

    await waitFor(() => {
      expect(ball.style.top).not.toBe("176px");
    });

    harness = getTransportHarness();
    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));
  });

  it("passes paused runtime velocity to the canvas in authored cartesian semantics", async () => {
    render(<App />);
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(ball);
    fireEvent.change(screen.getByLabelText("Velocity Y"), { target: { value: "3" } });
    const harness = await calculateResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));

    await waitFor(() => {
      expect(ball.style.top).not.toBe("176px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));

    await waitFor(() => {
      expect(
        (
          workspaceCanvasSpy.latestProps as {
            selectedRuntimeVelocityVector?: {
              entityId: string;
              velocityX: number;
              velocityY: number;
            } | null;
          } | null
        )?.selectedRuntimeVelocityVector,
      ).toMatchObject({
        entityId: "ball-1",
      });
    });

    expect(
      (
        workspaceCanvasSpy.latestProps as {
          selectedRuntimeVelocityVector?: {
            entityId: string;
            velocityX: number;
            velocityY: number;
          } | null;
        }
      ).selectedRuntimeVelocityVector?.velocityY,
    ).toBeGreaterThan(0);
  });

  it("passes selected runtime velocity immediately after cached calculation completes", async () => {
    render(<App />);
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(ball);
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    await calculateResult();

    await waitFor(() => {
      expect(
        (
          workspaceCanvasSpy.latestProps as {
            selectedRuntimeVelocityVector?: {
              entityId: string;
              velocityX: number;
              velocityY: number;
            } | null;
          } | null
        )?.selectedRuntimeVelocityVector,
      ).toMatchObject({
        entityId: "ball-1",
        velocityX: 0.6,
      });
    });

    expect(screen.getByTestId("scene-selected-runtime-velocity-arrowhead-ball-1")).toBeDefined();
    expect(screen.getByTestId("scene-selected-runtime-velocity-label-ball-1").textContent).toMatch(
      /^0\.\d{2} m\/s$/,
    );
    expect(screen.getByTestId("scene-selected-runtime-velocity-label-ball-1").textContent).not.toBe(
      "0.00 m/s",
    );
  });

  it("converts authored values and clears visible runtime state after changing units while paused", async () => {
    render(<App />);
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("1.32");
    expect((screen.getByLabelText("Velocity X") as HTMLInputElement).value).toBe("0.6");

    let harness = await calculateResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^play result$/i }));

    await waitFor(() => {
      expect(ball.style.left).not.toBe("132px");
    });

    fireEvent.click(harness.transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.change(screen.getByLabelText("Length unit"), { target: { value: "cm" } });
    fireEvent.change(screen.getByLabelText("Velocity unit"), { target: { value: "cm/s" } });

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect((screen.getByLabelText("Gravity") as HTMLInputElement).value).toBe("980");
      expect(screen.getByText("cm/s²")).toBeDefined();
      expect((screen.getByLabelText("Position X") as HTMLInputElement).value).toBe("132");
      expect((screen.getByLabelText("Velocity X") as HTMLInputElement).value).toBe("60");
      expect(ball.style.left).toBe("132px");
    });

    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^calculate$/i }));

    await waitFor(() => {
      expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
        false,
      );
    }, { timeout: 5_000 });

    harness = await rewindCalculatedResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect(ball.style.left).toBe("133px");
    });
  });

  it("mounts the transport controls above the workspace and keeps analysis in the bottom pane", () => {
    render(<App />);

    const centerPane = screen.getByTestId("shell-center-pane");
    const bottomPane = screen.getByTestId("shell-bottom-pane");

    expect(within(centerPane).getByTestId("playback-transport-deck")).toBeDefined();
    expect(within(centerPane).getByTestId("workspace-canvas")).toBeDefined();
    expect(within(centerPane).getByTestId("annotation-layer")).toBeDefined();
    expect(within(bottomPane).queryByTestId("bottom-transport-bar")).toBeNull();
    expect(within(bottomPane).getByTestId("analysis-panel")).toBeDefined();
  });

  it("defaults to calculate-first playback with disabled seek controls", () => {
    render(<App />);

    expect(screen.queryByLabelText("Playback mode")).toBeNull();
    expect(screen.getByRole("button", { name: /^calculate$/i })).toBeDefined();
    expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Jump to time") as HTMLInputElement).disabled).toBe(true);
  });

  it("precomputes cached playback and seeks by timeline and time input", async () => {
    render(<App />);
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(ball);
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    expect((screen.getByLabelText("Precompute duration") as HTMLInputElement).value).toBe("20");

    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^calculate$/i }));

    await waitFor(() => {
      expect(
        (
          within(screen.getByTestId("bottom-transport-bar")).getByRole("button", {
            name: "Calculating…",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(screen.getByTestId("runtime-status-banner").textContent).toContain(
        "Calculating the result.",
      );
      expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
        true,
      );
    });

    await waitFor(() => {
      expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
        false,
      );
    });

    expect(screen.getByTestId("analysis-runtime-summary").textContent).toContain(
      "Tracked entity: ball-1",
    );
    expect(screen.getByTestId("analysis-runtime-summary").textContent).toMatch(
      /Runtime sample count: [1-9]/,
    );

    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.input(screen.getByRole("slider", { name: /playback timeline/i }), {
      target: { value: "0.5" },
    });

    await waitFor(() => {
      expect(screen.getByText("0.50 s")).toBeDefined();
      expect(ball.style.left).toBe("162px");
    });

    fireEvent.change(screen.getByLabelText("Jump to time"), { target: { value: "0.25" } });
    fireEvent.blur(screen.getByLabelText("Jump to time"));

    await waitFor(() => {
      expect(screen.getByText("0.25 s")).toBeDefined();
      expect(ball.style.left).toBe("147px");
    });
  });

  it("shows intermediate preparing progress before cached playback finishes building", async () => {
    const animationFrame = createControlledAnimationFrame();

    render(<App />);

    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^calculate$/i }));

    await act(async () => {
      await flushMicrotasks();
    });

    expect(screen.getByTestId("transport-preparing-progress").textContent).toMatch(
      /^Preparing \d+%$/,
    );
    expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
      true,
    );

    await act(async () => {
      let guard = 0;

      while (screen.queryByTestId("transport-preparing-progress") && guard < 20) {
        if (animationFrame.pendingCount() > 0) {
          animationFrame.runNext(16);
        }

        await flushMicrotasks();
        guard += 1;
      }
    });

    await waitFor(() => {
      expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
        false,
      );
    });
  });

  it("resets cached playback to time zero after changing duration while paused", async () => {
    render(<App />);
    const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;

    fireEvent.click(ball);
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^calculate$/i }));

    await waitFor(() => {
      expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
        false,
      );
    });

    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^pause$/i }));
    fireEvent.input(screen.getByRole("slider", { name: /playback timeline/i }), {
      target: { value: "0.5" },
    });

    await waitFor(() => {
      expect(ball.style.left).toBe("162px");
    });

    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "2" } });

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect(ball.style.left).toBe("132px");
    });
  });
});
