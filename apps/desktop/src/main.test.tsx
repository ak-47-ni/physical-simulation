import { afterEach, describe, expect, it, vi } from "vitest";

const { createRootMock, renderMock } = vi.hoisted(() => {
  const render = vi.fn();
  const createRoot = vi.fn(() => ({
    render,
  }));

  return {
    createRootMock: createRoot,
    renderMock: render,
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("./App", () => ({
  App: () => null,
}));

describe("main", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    createRootMock.mockClear();
    renderMock.mockClear();
    vi.resetModules();
  });

  it("mounts the desktop app into the root container", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("./main");

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the root container is missing", async () => {
    await expect(import("./main")).rejects.toThrow(/root/i);
    expect(createRootMock).not.toHaveBeenCalled();
  });
});
