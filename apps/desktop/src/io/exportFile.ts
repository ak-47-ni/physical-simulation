import { save } from "@tauri-apps/plugin-dialog";

type DesktopFileExportInvoke = <T>(
  command: string,
  payload?: Record<string, unknown>,
) => Promise<T>;

type TauriInternals = {
  __TAURI_INTERNALS__?: {
    invoke?: DesktopFileExportInvoke;
  };
};

export type ExportTextFileOutcome =
  | {
      status: "cancelled";
    }
  | {
      status: "downloaded";
    }
  | {
      path: string;
      status: "saved";
    };

export type ExportTextFileInput = {
  allowDownloadFallback?: boolean;
  contents: string;
  defaultFileName: string;
  fallbackDownload: (filename: string, contents: string) => void;
  invoke?: DesktopFileExportInvoke | null;
  saveDialog?: SaveDialog;
};

type SaveDialog = (options: {
  defaultPath: string;
  filters: Array<{
    extensions: string[];
    name: string;
  }>;
}) => Promise<string | null>;

export async function exportTextFile(
  input: ExportTextFileInput,
): Promise<ExportTextFileOutcome> {
  const invoke = input.invoke === undefined ? resolveTauriInvoke() : input.invoke;
  const allowDownloadFallback = input.allowDownloadFallback === true;

  if (!invoke) {
    if (allowDownloadFallback) {
      input.fallbackDownload(input.defaultFileName, input.contents);
      return { status: "downloaded" };
    }

    throw new Error("Desktop export is unavailable. Restart the Tauri desktop shell.");
  }

  const saveDialog = input.saveDialog ?? save;
  const selectedPath = await saveDialog({
    defaultPath: sanitizeDefaultFileName(input.defaultFileName),
    filters: [
      {
        extensions: ["json"],
        name: "JSON",
      },
    ],
  });

  if (!selectedPath) {
    return { status: "cancelled" };
  }

  const savedPath = await invoke<unknown>("write_export_text_file", {
    contents: input.contents,
    path: selectedPath,
  });

  if (typeof savedPath === "string" && savedPath.trim() !== "") {
    return {
      path: savedPath,
      status: "saved",
    };
  }

  throw new Error("Invalid desktop export response.");
}

function resolveTauriInvoke(): DesktopFileExportInvoke | null {
  const candidate = globalThis as TauriInternals;

  return typeof candidate.__TAURI_INTERNALS__?.invoke === "function"
    ? candidate.__TAURI_INTERNALS__.invoke
    : null;
}

function sanitizeDefaultFileName(defaultFileName: string): string {
  const sanitized = defaultFileName
    .trim()
    .replace(/[\\/:\u0000-\u001f]+/g, "-");

  return sanitized.length > 0 ? sanitized : "physics-sandbox-export.json";
}
