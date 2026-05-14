import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { desktopAppVersion } from "./app-meta";
import { createInitialAuthoringState } from "./state/appEditorHelpers";
import { createSceneDocumentFromEditorState } from "./state/editorSceneDocument";
import { createSceneDisplaySettings, parseSceneFile } from "./io/sceneFile";
import {
  parseRuntimeResultFile,
  serializeRuntimeResultFile,
} from "./io/resultFile";

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

function installDownloadSpy() {
  let latestBlob: Blob | null = null;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      latestBlob = blob;
      return "blob:physics-sandbox-test";
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLAnchorElement.prototype, "click", {
    configurable: true,
    value: vi.fn(),
  });

  return {
    latestBlob() {
      return latestBlob;
    },
    restore() {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
      Object.defineProperty(HTMLAnchorElement.prototype, "click", {
        configurable: true,
        value: originalAnchorClick,
      });
    },
  };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(blob);
  });
}

function getTransportHarness() {
  const transport = within(screen.getByTestId("bottom-transport-bar"));
  const topRow = within(screen.getByTestId("transport-compact-row"));

  return { topRow, transport };
}

function openInspectorTab(name: RegExp | string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

function expectVisibleInspectorPanel(panelId: string) {
  for (const id of ["selection", "display", "scene-tree", "scene-physics"]) {
    const panel = screen.getByTestId(`inspector-panel-${id}`) as HTMLElement;

    expect(panel.style.display).toBe(id === panelId ? "block" : "none");
  }
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
  it("exports scene files and enables result export after cached calculation is ready", async () => {
    const downloadSpy = installDownloadSpy();

    try {
      render(<App />);

      expect(screen.getByRole("button", { name: /^import$/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /^export scene$/i })).toBeDefined();
      expect(
        (screen.getByRole("button", { name: /^export result$/i }) as HTMLButtonElement).disabled,
      ).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: /^export scene$/i }));

      const sceneBlob = downloadSpy.latestBlob();
      expect(sceneBlob).not.toBeNull();
      expect(parseSceneFile(await readBlobText(sceneBlob!)).format).toBe("physics-sandbox-scene");

      await calculateResult(1);

      const exportResultButton = screen.getByRole("button", { name: /^export result$/i });
      expect((exportResultButton as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(exportResultButton);

      const resultBlob = downloadSpy.latestBlob();
      expect(resultBlob).not.toBeNull();

      const parsed = parseRuntimeResultFile(await readBlobText(resultBlob!));

      expect(parsed.appVersion).toBe(desktopAppVersion);
      expect(parsed.runtime.precomputeDurationSeconds).toBe(1);
      expect(parsed.runtime.stepSeconds).toBe(1 / 60);
      expect(parsed.runtime.frames.length).toBeGreaterThan(1);
      expect(parsed.scene.entities.length).toBeGreaterThan(0);
    } finally {
      downloadSpy.restore();
    }
  });

  it("imports a runtime result file and restores calculated playback without recalculating", async () => {
    const authoringState = createInitialAuthoringState();
    const scene = createSceneDocumentFromEditorState({
      constraints: authoringState.constraints,
      entities: authoringState.entities,
    });
    const serialized = serializeRuntimeResultFile({
      appVersion: desktopAppVersion,
      authoring: authoringState.settings,
      display: createSceneDisplaySettings({ showLabels: true }),
      frames: [
        {
          frame: {
            entities: [
              {
                id: "ball-1",
                transform: { rotation: 0, x: 4.64, y: 2.44 },
                velocity: { x: 0.5, y: 0 },
              },
            ],
            frameNumber: 0,
          },
          timeSeconds: 0,
        },
        {
          frame: {
            entities: [
              {
                id: "ball-1",
                transform: { rotation: 0, x: 4.66, y: 2.46 },
                velocity: { x: 0.5, y: 0.2 },
              },
            ],
            frameNumber: 1,
          },
          timeSeconds: 1 / 60,
        },
      ],
      precomputeDurationSeconds: 1,
      scene,
      selectedConstraintId: null,
      selectedEntityId: "ball-1",
    });

    render(<App />);

    const input = screen.getByTestId("file-import-input") as HTMLInputElement;
    const file = new File([serialized], "lesson-result.psresult.json", {
      type: "application/json",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect((screen.getByRole("slider", { name: /playback timeline/i }) as HTMLInputElement).disabled).toBe(
        false,
      );
      const ball = screen.getByTestId("scene-entity-ball-1") as HTMLElement;
      expect(ball.style.left).toBe("440px");
      expect(ball.style.top).toBe("220px");
      expect(screen.getByText("0.00 s")).toBeDefined();
    });
  });

  it("moves scene physics into the inspector tab set with SI defaults and classroom world scale", () => {
    render(<App />);

    const leftPane = within(screen.getByTestId("shell-left-pane"));
    const rightPane = within(screen.getByTestId("shell-right-pane"));
    const inspectorTabs = screen.getAllByRole("tab");

    expect(inspectorTabs.map((tab) => tab.textContent)).toEqual([
      "SELECTION",
      "DISPLAY",
      "SCENE TREE",
      "SCENE PHYSICS",
    ]);
    expect(screen.getByRole("tab", { name: "SELECTION" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(leftPane.queryByLabelText("Gravity")).toBeNull();
    expectVisibleInspectorPanel("selection");

    openInspectorTab("SCENE PHYSICS");

    expect(screen.getByRole("tab", { name: "SCENE PHYSICS" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expectVisibleInspectorPanel("scene-physics");
    expect((rightPane.getByLabelText("Gravity") as HTMLInputElement).value).toBe("10");
    expect(rightPane.getByText("m/s²")).toBeDefined();
    expect((rightPane.getByLabelText("Length unit") as HTMLSelectElement).value).toBe("m");
    expect((rightPane.getByLabelText("Velocity unit") as HTMLSelectElement).value).toBe("m/s");
    expect((rightPane.getByLabelText("Mass unit") as HTMLSelectElement).value).toBe("kg");
    expect((rightPane.getByLabelText("Pixels per meter") as HTMLInputElement).value).toBe("100");
  });

  it("syncs wheel zoom changes into the scene physics pixels-per-meter field", () => {
    render(<App />);

    openInspectorTab("SCENE PHYSICS");

    fireEvent.wheel(screen.getByTestId("workspace-stage"), {
      clientX: 250,
      clientY: 200,
      deltaY: -100,
    });

    expect((screen.getByLabelText("Pixels per meter") as HTMLInputElement).value).toBe("110");
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

    expect(screen.queryByLabelText("Show trajectories")).toBeNull();
    expect(screen.queryByTestId("trajectory-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show trajectories/i }));

    expect(screen.getByTestId("trajectory-overlay")).toBeDefined();
  });

  it("locks workspace authoring while ink mode is active", () => {
    render(<App />);

    expect(
      (workspaceCanvasSpy.latestProps as { authoringLocked?: boolean } | null)?.authoringLocked,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /^ink$/i }));

    expect(
      (workspaceCanvasSpy.latestProps as { authoringLocked?: boolean } | null)?.authoringLocked,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /cancel ink/i }));

    expect(
      (workspaceCanvasSpy.latestProps as { authoringLocked?: boolean } | null)?.authoringLocked,
    ).toBe(false);
  });

  it("keeps the calculated runtime frame visible while drawing annotations", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    let harness = await calculateResult();
    harness = await rewindCalculatedResult();
    fireEvent.click(harness.transport.getByRole("button", { name: /^step$/i }));

    await waitFor(() => {
      expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
      expect(screen.getByText("0.02 s")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^ink$/i }));
    const surface = screen.getByTestId("annotation-layer-surface");
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 12 });
    fireEvent.pointerMove(surface, { clientX: 30, clientY: 24 });
    fireEvent.pointerUp(surface, { clientX: 30, clientY: 24 });

    expect(screen.getByTestId("annotation-stroke-0")).toBeDefined();
    expect((screen.getByTestId("scene-entity-ball-1") as HTMLElement).style.left).toBe("133px");
    expect(screen.getByText("0.02 s")).toBeDefined();
  });

  it("moves existing annotations together with the stage when the workspace is panned", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^ink$/i }));
    const surface = screen.getByTestId("annotation-layer-surface");
    fireEvent(
      surface,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 24, button: 0 }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 36, button: 0 }),
    );
    fireEvent(
      surface,
      new MouseEvent("pointerup", { bubbles: true, clientX: 40, clientY: 36, button: 0 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel ink/i }));

    expect(screen.getByTestId("annotation-layer-viewport").getAttribute("transform")).toBe(
      "translate(0 0)",
    );

    fireEvent.mouseDown(screen.getByTestId("workspace-stage"), {
      button: 2,
      clientX: 160,
      clientY: 180,
    });
    fireEvent.mouseMove(window, {
      clientX: 210,
      clientY: 225,
    });
    fireEvent.mouseUp(window, {
      clientX: 210,
      clientY: 225,
    });

    expect(screen.getByTestId("annotation-layer-viewport").getAttribute("transform")).toBe(
      "translate(50 45)",
    );
    expect(screen.getByTestId("annotation-stroke-0").getAttribute("points")).toBe(
      "20,24 40,36 40,36",
    );
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

    openInspectorTab("SCENE PHYSICS");
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
    openInspectorTab("SCENE PHYSICS");
    fireEvent.change(screen.getByLabelText("Length unit"), { target: { value: "cm" } });
    fireEvent.change(screen.getByLabelText("Velocity unit"), { target: { value: "cm/s" } });
    openInspectorTab("SELECTION");

    await waitFor(() => {
      expect(screen.getByText("0.00 s")).toBeDefined();
      expect((screen.getByLabelText("Gravity") as HTMLInputElement).value).toBe("1000");
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
    const centerStack = within(centerPane).getByTestId("workspace-center-stack") as HTMLElement;

    expect(centerStack.style.gridTemplateRows).toBe("auto auto");
    expect(centerStack.style.alignContent).toBe("start");
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

    expect((screen.getByLabelText("Precompute duration") as HTMLInputElement).value).toBe("5");

    fireEvent.change(screen.getByLabelText("Precompute duration"), { target: { value: "1" } });
    fireEvent.click(getTransportHarness().transport.getByRole("button", { name: /^calculate$/i }));

    expect(screen.queryByTestId("runtime-status-banner")).toBeNull();

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

  it("shows selected-object trajectory and motion charts from cached playback frames", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("scene-entity-ball-1"));
    fireEvent.change(screen.getByLabelText("Velocity X"), { target: { value: "0.6" } });

    await calculateResult(1);

    await waitFor(() => {
      expect(screen.getByText(/Motion samples: [1-9]/)).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText("Show selected trajectory"));

    expect(screen.getByTestId("scene-selected-trajectory-ball-1")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /motion charts/i }));

    expect(screen.getByRole("dialog", { name: /motion charts/i })).toBeDefined();
    expect(screen.getByTestId("motion-chart-displacement")).toBeDefined();
    expect(screen.getByTestId("motion-chart-velocity")).toBeDefined();
    expect(screen.getByText(/Absolute position:/)).toBeDefined();
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
