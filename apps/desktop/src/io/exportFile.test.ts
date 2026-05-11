import { describe, expect, it, vi } from "vitest";

import { exportTextFile } from "./exportFile";

describe("exportTextFile", () => {
  it("opens the desktop save dialog and writes to the selected path", async () => {
    const fallbackDownload = vi.fn();
    const saveDialog = vi.fn(async () => "/Users/test/lesson.psscene.json");
    const invoke = vi.fn(async () => "/Users/test/lesson.psscene.json");

    const outcome = await exportTextFile({
      contents: "{\"ok\":true}",
      defaultFileName: "lesson.psscene.json",
      fallbackDownload,
      invoke,
      saveDialog,
    });

    expect(saveDialog).toHaveBeenCalledWith({
      defaultPath: "lesson.psscene.json",
      filters: [{ extensions: ["json"], name: "JSON" }],
    });
    expect(invoke).toHaveBeenCalledWith("write_export_text_file", {
      contents: "{\"ok\":true}",
      path: "/Users/test/lesson.psscene.json",
    });
    expect(fallbackDownload).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      path: "/Users/test/lesson.psscene.json",
      status: "saved",
    });
  });

  it("treats a null save dialog response as a cancelled export", async () => {
    const fallbackDownload = vi.fn();
    const saveDialog = vi.fn(async () => null);
    const invoke = vi.fn(async () => "/Users/test/lesson.psresult.json");

    const outcome = await exportTextFile({
      contents: "{}",
      defaultFileName: "lesson.psresult.json",
      fallbackDownload,
      invoke,
      saveDialog,
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(fallbackDownload).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "cancelled" });
  });

  it("falls back to browser download when no desktop transport exists and fallback is allowed", async () => {
    const fallbackDownload = vi.fn();

    const outcome = await exportTextFile({
      allowDownloadFallback: true,
      contents: "{}",
      defaultFileName: "lesson.psscene.json",
      fallbackDownload,
      invoke: null,
      saveDialog: vi.fn(),
    });

    expect(fallbackDownload).toHaveBeenCalledWith("lesson.psscene.json", "{}");
    expect(outcome).toEqual({ status: "downloaded" });
  });

  it("rejects instead of downloading when no desktop transport exists", async () => {
    const fallbackDownload = vi.fn();

    await expect(
      exportTextFile({
        contents: "{}",
        defaultFileName: "lesson.psscene.json",
        fallbackDownload,
        invoke: null,
        saveDialog: vi.fn(),
      }),
    ).rejects.toThrow(/desktop export is unavailable/i);

    expect(fallbackDownload).not.toHaveBeenCalled();
  });

  it("rejects instead of downloading when the desktop write command fails", async () => {
    const fallbackDownload = vi.fn();
    const saveDialog = vi.fn(async () => "/Users/test/lesson.psscene.json");
    const invoke = vi.fn(async () => {
      throw new Error("permission denied");
    });

    await expect(
      exportTextFile({
        allowDownloadFallback: true,
        contents: "{}",
        defaultFileName: "lesson.psscene.json",
        fallbackDownload,
        invoke,
        saveDialog,
      }),
    ).rejects.toThrow(/permission denied/i);

    expect(fallbackDownload).not.toHaveBeenCalled();
  });

  it("sanitizes default filenames before opening the save dialog", async () => {
    const saveDialog = vi.fn(async () => "/Users/test/physics-sandbox-export.json");

    await exportTextFile({
      contents: "{}",
      defaultFileName: " physics/sandbox:scene\u0000.json ",
      fallbackDownload: vi.fn(),
      invoke: vi.fn(async () => "/Users/test/physics-sandbox-export.json"),
      saveDialog,
    });

    expect(saveDialog).toHaveBeenCalledWith({
      defaultPath: "physics-sandbox-scene-.json",
      filters: [{ extensions: ["json"], name: "JSON" }],
    });
  });

  it("rejects unexpected desktop export responses", async () => {
    const fallbackDownload = vi.fn();
    const invoke = vi.fn(async () => ({ path: "/tmp/file.json" }));

    await expect(
      exportTextFile({
        contents: "{}",
        defaultFileName: "lesson.psscene.json",
        fallbackDownload,
        invoke,
        saveDialog: vi.fn(async () => "/tmp/file.json"),
      }),
    ).rejects.toThrow(/invalid desktop export response/i);
  });
});
