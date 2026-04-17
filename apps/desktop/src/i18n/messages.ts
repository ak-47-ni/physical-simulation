import type { AppLocale } from "./locale";

const enMessages = {
  "shell.title": "Desktop editor",
  "shell.subtitle": "Build and review classroom physics scenes.",
  "shell.version": "Version {version}",
  "shell.resetLayout": "Reset layout",
  "shell.languageLabel": "Language",
  "shell.language.en": "English",
  "shell.language.zh-CN": "简体中文",
  "shell.pane.library": "Library",
  "shell.pane.libraryShort": "Lib",
  "shell.pane.inspector": "Inspector",
  "shell.pane.inspectorShort": "Insp",
  "shell.pane.transport": "Transport",
  "shell.pane.transportShort": "Ctrl",
  "shell.toggle.showLibrary": "Show library",
  "shell.toggle.hideLibrary": "Hide library",
  "shell.toggle.showInspector": "Show inspector",
  "shell.toggle.hideInspector": "Hide inspector",
  "shell.toggle.showTransport": "Show transport",
  "shell.toggle.hideTransport": "Hide transport",
  "shell.resize.library": "Resize library pane",
  "shell.resize.inspector": "Resize inspector pane",
  "shell.resize.transport": "Resize transport pane",
  "shell.workspaceMount": "Workspace mount point",
} as const;

type MessageCatalog = typeof enMessages;

const zhCnMessages: MessageCatalog = {
  "shell.title": "桌面编辑器",
  "shell.subtitle": "搭建并检查课堂物理场景。",
  "shell.version": "版本 {version}",
  "shell.resetLayout": "重置布局",
  "shell.languageLabel": "语言",
  "shell.language.en": "English",
  "shell.language.zh-CN": "简体中文",
  "shell.pane.library": "对象库",
  "shell.pane.libraryShort": "对象库",
  "shell.pane.inspector": "属性面板",
  "shell.pane.inspectorShort": "属性",
  "shell.pane.transport": "播放控制",
  "shell.pane.transportShort": "控制",
  "shell.toggle.showLibrary": "显示对象库",
  "shell.toggle.hideLibrary": "隐藏对象库",
  "shell.toggle.showInspector": "显示属性面板",
  "shell.toggle.hideInspector": "隐藏属性面板",
  "shell.toggle.showTransport": "显示播放控制",
  "shell.toggle.hideTransport": "隐藏播放控制",
  "shell.resize.library": "调整对象库面板",
  "shell.resize.inspector": "调整属性面板",
  "shell.resize.transport": "调整播放控制面板",
  "shell.workspaceMount": "工作区挂载点",
};

export type MessageKey = keyof MessageCatalog;

export const messages: Record<AppLocale, MessageCatalog> = {
  en: enMessages,
  "zh-CN": zhCnMessages,
};

export function formatMessage(
  template: string,
  variables?: Record<string, number | string>,
): string {
  if (!variables) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (placeholder, variableName: string) => {
    const value = variables[variableName];

    return value === undefined ? placeholder : String(value);
  });
}
