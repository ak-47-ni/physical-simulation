import type { MessageKey } from "./i18n";

type Translate = (key: MessageKey, variables?: Record<string, number | string>) => string;

const systemCopyKeyByEnglishCopy: Record<string, MessageKey> = {
  "Scene physics is locked while runtime is playing.": "system.lock.scenePhysics",
  "Authoring is locked while runtime is playing.": "system.lock.authoring",
  "Select first body for the spring": "system.hint.spring.firstBody",
  "Select second body for the spring": "system.hint.spring.secondBody",
  "Select a body for the track": "system.hint.track.selectBody",
  "Pick a point to define the track axis": "system.hint.track.pickPoint",
  "Select a locked board for the arc track": "system.hint.arcTrack.selectBoard",
  "Select the board endpoint for the arc junction": "system.hint.arcTrack.selectBoardEndpoint",
  "Pick a point to set the arc radius": "system.hint.arcTrack.pickRadiusPoint",
  "Drag out the arc radius": "system.hint.arcTrack.dragRadius",
  "Choose the arc span": "system.hint.arcTrack.chooseSpan",
  "Choose an arc span preset to create the arc track":
    "system.hint.arcTrack.chooseSpanPreset",
  "Rebuild required before starting runtime.": "system.runtime.rebuildRequiredBeforeStart",
};

export function localizeSystemCopy(
  copy: string | null | undefined,
  t: Translate,
): string | null | undefined {
  if (!copy) {
    return copy;
  }

  const key = systemCopyKeyByEnglishCopy[copy];

  return key ? t(key) : copy;
}
