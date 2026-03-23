export const EDITOR_TOOL_OPTIONS = ["select", "pan", "place-body", "place-constraint"] as const;

export type EditorTool = (typeof EDITOR_TOOL_OPTIONS)[number];
