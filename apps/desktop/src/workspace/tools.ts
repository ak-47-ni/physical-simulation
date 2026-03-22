export const EDITOR_TOOL_OPTIONS = ["select", "pan", "place-body"] as const;

export type EditorTool = (typeof EDITOR_TOOL_OPTIONS)[number];
