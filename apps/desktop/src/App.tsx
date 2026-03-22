import { useState } from "react";

import { AnalysisPanel } from "./analysis/AnalysisPanel";
import { AnnotationLayer } from "./annotation/AnnotationLayer";
import { createSceneDisplaySettings } from "./io/sceneFile";
import { ShellLayout } from "./layout/ShellLayout";
import { BottomTransportBar } from "./panels/BottomTransportBar";
import { ObjectLibraryPanel } from "./panels/ObjectLibraryPanel";
import { PropertyPanel } from "./panels/PropertyPanel";
import { SceneTreePanel } from "./panels/SceneTreePanel";
import {
  createInitialEditorState,
  type EditorSceneEntity,
} from "./state/editorStore";
import {
  createInitialRuntimeBridgeState,
  pauseRuntimeBridge,
  resetRuntimeBridge,
  resumeRuntimeBridge,
  setRuntimeBridgeTimeScale,
  stepRuntimeBridge,
} from "./state/runtimeBridge";
import { WorkspaceCanvas } from "./workspace/WorkspaceCanvas";
import type { EditorTool } from "./workspace/tools";

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [runtimeState, setRuntimeState] = useState(createInitialRuntimeBridgeState);
  const [displaySettings, setDisplaySettings] = useState(() =>
    createSceneDisplaySettings({
      gridVisible: true,
      showLabels: true,
      showTrajectories: false,
    }),
  );
  const sampleEntities: EditorSceneEntity[] = [
    { id: "ball-1", label: "Ball 1", x: 132, y: 176 },
    { id: "board-1", label: "Board 1", x: 318, y: 272 },
  ];

  function handleToolChange(tool: EditorTool) {
    setEditorState((current) => ({
      ...current,
      activeTool: tool,
    }));
  }

  function handleGridVisibleChange(visible: boolean) {
    setEditorState((current) => ({
      ...current,
      gridVisible: visible,
    }));
  }

  function handleSelectEntity(entityId: string) {
    setEditorState((current) => ({
      ...current,
      selectedEntityId: entityId,
    }));
  }

  const selectedEntity =
    sampleEntities.find((entity) => entity.id === editorState.selectedEntityId) ?? null;

  return (
    <ShellLayout
      bottomPane={
        <div style={{ display: "grid", gap: "14px" }}>
          <BottomTransportBar
            runtime={runtimeState}
            onPause={() => {
              setRuntimeState((current) => pauseRuntimeBridge(current));
            }}
            onReset={() => {
              setRuntimeState((current) => resetRuntimeBridge(current));
            }}
            onStart={() => {
              setRuntimeState((current) => resumeRuntimeBridge(current));
            }}
            onStep={() => {
              setRuntimeState((current) => stepRuntimeBridge(current));
            }}
            onTimeScaleChange={(nextScale) => {
              setRuntimeState((current) => setRuntimeBridgeTimeScale(current, nextScale));
            }}
          />
          <AnalysisPanel
            display={{
              showTrajectories: displaySettings.showTrajectories,
              showVelocityVectors: displaySettings.showVelocityVectors,
              showForceVectors: displaySettings.showForceVectors,
            }}
            onDisplayChange={(nextDisplay) => {
              setDisplaySettings((current) => ({
                ...current,
                ...nextDisplay,
              }));
            }}
          />
        </div>
      }
      leftPane={<ObjectLibraryPanel />}
      rightPane={
        <div style={{ display: "grid", gap: "16px" }}>
          <PropertyPanel display={displaySettings} selectedEntity={selectedEntity} />
          <SceneTreePanel
            entities={sampleEntities}
            onSelect={handleSelectEntity}
            selectedEntityId={editorState.selectedEntityId}
          />
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: "14px" }}>
        <WorkspaceCanvas
          entities={sampleEntities}
          onGridVisibleChange={handleGridVisibleChange}
          onToolChange={handleToolChange}
          state={editorState}
        />
        <AnnotationLayer />
      </div>
    </ShellLayout>
  );
}
